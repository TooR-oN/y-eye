# Y-EYE OSINT Intelligence Platform - Handoff Document

> **Last Updated**: 2026-02-18
> **Purpose**: 대화 세션 간 맥락 유지를 위한 핸드오프 문서. 압축/세션 전환 시 이 문서를 먼저 읽을 것.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **프로젝트명** | Y-EYE (OSINT Intelligence Platform) |
| **목적** | 불법 웹툰 사이트 운영자 추적을 위한 OSINT 수사 자료 관리 플랫폼 |
| **사용자** | 1인 (본인만 사용), 비개발자 |
| **플랫폼** | Electron 데스크톱 앱 (macOS 전용) |
| **보안** | 완전 로컬 실행, 외부 접근 불가 (민감한 수사 자료 포함) |
| **개발 환경** | 이 샌드박스는 Cloudflare Pages용이므로, Electron 앱의 소스 코드 개발과 구조 설계를 여기서 진행. 최종 빌드는 사용자의 로컬 Mac에서 수행 |

---

## 2. 기술 스택

| 계층 | 기술 | 선택 이유 |
|------|------|----------|
| 앱 프레임워크 | Electron + Electron Forge | macOS 네이티브 앱, 파일시스템 접근 |
| 프론트엔드 | React 18 + Vite + TypeScript | 빠른 개발, 컴포넌트 기반 UI |
| 스타일링 | TailwindCSS | 빠른 UI 구축, 유틸리티 기반 |
| 로컬 DB | SQLite (better-sqlite3) | 무료, 서버 불필요, Electron 내장 |
| 외부 DB | Neon PostgreSQL (읽기 전용) | Jobdori 데이터 연동 |
| AI | Claude API (Anthropic) | 텍스트 분석, 스크린샷 분석 (Vision) |
| 그래프 시각화 | React Flow + D3.js | 관계도, 네트워크 시각화 |
| 노트 시스템 | Obsidian Vault 연동 | 마크다운 파일 직접 읽기/쓰기 |
| 이미지 저장 | 로컬 파일시스템 (Vault 내) | 증거 이미지 관리 |

---

## 3. 핵심 아키텍처

```
Electron (macOS)
├── Frontend (Renderer)        │ Backend (Main Process)
│   React + Vite               │ SQLite (better-sqlite3)
│   TailwindCSS                │ Neon DB (읽기 전용 연동)
│   D3.js (그래프)              │ Claude API (AI 분석)
│   React Flow (네트워크 시각화) │ Obsidian Vault 관리 (마크다운 읽기/쓰기)
│
├── Obsidian Vault (Google Drive 내)
└── 로컬 SQLite DB (앱 데이터 폴더)
```

### 데이터 흐름

```
Jobdori Neon DB ──(읽기 전용)──> 주기적 동기화 ──> 로컬 SQLite
  - sites 테이블                  (수동/자동)      - sites 테이블
  - traffic 정보                                  - osint_entries
  - 상태 정보                                     - persons
  - 도메인 변경                                   - 관계도 등
```

### 동기화 규칙
- 최상위 타겟 지정, OSINT 조사 필요 → 자동으로 sites에 추가 (investigation_status: 'pending')
- 기타 권고사항 사이트 → Jobdori 검색으로 찾아 수동 추가 가능
- Jobdori에서 사이트 상태 변경(폐쇄 등) → Platform에 자동 반영
- Jobdori에서 도메인 변경 감지 → Platform에서 노트 병합 알림

---

## 4. Jobdori DB 연동 (Neon PostgreSQL)

### 핵심 테이블

| 테이블 | 용도 | 연동 필요 컬럼 |
|--------|------|--------------|
| sites | 불법/합법 사이트 목록 | domain, type, site_type, site_status, new_url, distribution_channel |
| domain_analysis_results | 월간 트래픽 분석 결과 | domain, threat_score, total_visits, unique_visitors, global_rank, recommendation, site_type |
| domain_analysis_reports | 분석 리포트 메타 | analysis_month, status, total_domains |
| site_notes | 사이트별 활동 이력/메모 | domain, note_type, content |
| detection_results | 탐지 결과 (URL별) | domain, url, title, final_status |

---

## 5. AI 기능 설계 (Claude API)

### 4가지 핵심 기능

| 기능 | 설명 |
|------|------|
| **1. 자동 구조화 (기본)** | 자유 텍스트 → AI가 WHOIS/IP/DNS 등 섹션별 마크다운으로 자동 분류 |
| **2. 자동 링크 추천** | AI가 입력 내용에서 관련 인물/사이트를 감지해 "이 정보는 [운영자A]와 관련될 수 있습니다" 식으로 추천 |
| **3. 분석 인사이트 제안** | 축적된 데이터를 기반으로 "이 IP는 사이트 X와 동일합니다", "이 이메일은 운영자 Y가 사용한 것과 일치합니다" 등 패턴 발견 |
| **4. 스크린샷 분석 (추가)** | 사용자가 스크린샷 업로드 → AI가 이미지에서 OSINT 정보 추출 → 자동 기록 + 이미지 첨부 |

### AI 인사이트 페이지 설계 (Phase 4-4)

사용자 원래 요청: **"전체 분석을 실행하기 보다는 웹사이트별, 인물별로 실행하도록 필터를 걸 수 있게 해줘. 전체 분석하면 조사 대상 사이트가 늘어나고 정보가 늘어날수록 무분별하게 토큰을 많이 사용할거 같아"**

#### 최종 확정된 UI 구조 (연쇄 드롭다운)

```
AI 인사이트 페이지
┌─────────────────────────────────────────────────┐
│ 분석 대상 선택:                                    │
│ ┌─────────────────────────────────────────────┐ │
│ │ [사이트 ▼]  →  [manhwa-es.com ▼]           │ │
│ │  (또는)                                      │ │
│ │ [인물 ▼]    →  [DarkWebtoon ▼]             │ │
│ └─────────────────────────────────────────────┘ │
│                                                   │
│ [분석 실행] ← 선택한 대상만 분석                     │
│                                                   │
│ ──────────── 분석 결과 ────────────                │
│ 🔗 manhwa-es.com과 ero18x.com이                   │
│    동일 Cloudflare IP 대역 사용                     │
│    신뢰도: 85%  [확인] [기각]                       │
│                                                   │
│ 📊 운영자 Alpha의 이메일이                          │
│    bato.si 등록정보에서도 발견                       │
│    신뢰도: 72%  [확인] [기각]                       │
│                                                   │
│ ──────────── 과거 인사이트 ────────────             │
│ (이전에 확인/기각 처리한 인사이트 이력)                │
└─────────────────────────────────────────────────┘
```

**핵심 포인트:**
- 첫 번째 드롭다운: "사이트" 또는 "인물" 선택
- "사이트" 선택 시 → 두 번째에 등록된 사이트 목록 드롭다운 표시
- "인물" 선택 시 → 두 번째에 등록된 인물 목록 드롭다운 표시
- **전체 분석이 아닌 선택적 분석** (토큰 절약)
- 사이트별 분석: 해당 사이트 + 연관 도메인/인물의 OSINT 데이터만 Claude에 전달
- 인물별 분석: 해당 인물 + 관련 사이트의 OSINT 데이터만 Claude에 전달
- 각 인사이트별 **확인/기각/보류** 처리
- 분석 이력 보존

---

## 6. Obsidian Vault 구조

```
Google Drive/OSINT-Vault/          ← Vault 루트 (Google Drive 내)
├── Sites/                          ← 사이트별 노트
│   ├── manhwa-es.com.md            ← 도메인명 = 파일명
│   ├── ero18x.com.md
│   └── ...
├── Persons/                        ← 인물별 노트
│   ├── Operator-Alpha.md
│   └── ...
├── Evidence/                       ← 증거 이미지/파일
│   ├── manhwa-es.com/
│   │   └── whois-screenshot-2026-02-18.png
│   └── ero18x.com/
├── AI-Insights/                    ← AI 분석 결과 노트
│   └── insight-2026-02-18.md
├── Templates/                      ← 노트 템플릿
│   ├── site-template.md
│   └── person-template.md
└── .obsidian/                      ← 옵시디언 설정
```

### 사이트 노트 예시 (manhwa-es.com.md)
```markdown
---
domain: manhwa-es.com
previous_domains: [manhwa-latino.com]
type: Scanlation
status: active
priority: critical
investigation_status: in_progress
tags: [scanlation, spanish, critical-target]
created: 2026-02-18
---

# manhwa-es.com

## 과거 도메인 manhwa-latino.com 시절 조사 결과
> [!info] 도메인 변경 이력
> manhwa-latino.com → manhwa-es.com (2026-02-18 감지)

### WHOIS 정보
- 등록일: 2024-03-15
- 등록기관: Namecheap

### IP/서버 정보
- IP: 104.21.xx.xx

---

## 현재 도메인 manhwa-es.com 조사 결과
### WHOIS 정보
- ...

## 연관 도메인
- [[ero18x.com]] - 같은 운영자 운영

## 연관 인물
- [[Operator-Alpha]] - 운영자 (추정)
```

### 인물 노트 (alias 추가)
```markdown
---
aliases: [OperatorA, admin_es, 등]
real_name:
risk_level: high
---
```

### 핵심 규칙
- **사이트 노트에서 인물 정보도 볼 수 있어야 함** (연관 인물 섹션 표시)
- 인물별 노트가 별도 폴더에 있더라도, 사이트 노트에서 인물별 내용도 보임
- `aliases` 필드는 사이트 노트에서 제거 → 인물 노트에만 추가
- "옵시디언에서 열기" 버튼 → obsidian:// URI 스킴으로 바로 열기

---

## 7. 도메인 그룹핑 & 노트 병합

### 도메인 변경 시나리오
예: manhwa-latino.com → manhwa-es.com으로 도메인 변경

1. Jobdori에서 도메인 변경 감지
2. Platform에 알림: "도메인 변경 감지"
3. 사용자 확인: "manhwa-es.com이 이미 별도 노트로 존재합니다. 병합하시겠습니까?"
4. 병합 실행:
   - manhwa-es.com 노트가 새 메인 노트가 됨
   - manhwa-latino.com의 기존 내용 → "과거 도메인 시절 조사 결과" 섹션으로 이동
   - 도메인 이력에 변경 기록
   - 옵시디언 Vault 파일도 동기화
5. 거절 → 별도 노트 유지

### "연관도메인" 개념
- "하위 도메인"이 아닌, 같은 운영자가 운영하는 **별도 사이트**
- 예: manhwa-es.com의 운영자가 ero18x.com도 운영
- ero18x.com도 별도 노트가 있되, 상위 노트(manhwa-es.com)에서 같이 보임

---

## 8. 개발 Phase 계획

### Phase 1: 기반 구축 (핵심) - **완료**
| 단계 | 작업 | 설명 | 상태 |
|------|------|------|------|
| 1-1 | Electron + React 프로젝트 셋업 | Electron + Vite + React + TypeScript | ✅ |
| 1-2 | SQLite DB 구축 | better-sqlite3, 전체 스키마 생성 | ✅ |
| 1-3 | 기본 UI 레이아웃 | 사이드바 네비게이션, 라우팅, 기본 테마 | ✅ |
| 1-4 | 사이트 CRUD | 사이트 목록/상세/추가/편집/삭제 | ✅ |
| 1-5 | 인물 CRUD | 인물 목록/상세/추가/편집/삭제 | ✅ |
| 1-6 | OSINT 정보 입력 | 자유 텍스트 입력 + 카테고리 분류 | ✅ |

### Phase 2: Jobdori 연동 - **진행 중**
| 단계 | 작업 | 설명 | 상태 |
|------|------|------|------|
| 2-1 | Neon DB 연결 | 읽기 전용 연결, 스키마 매핑 | ✅ |
| 2-2 | 동기화 엔진 | 자동/수동 동기화, 상태 반영 | ✅ |
| 2-3 | 도메인 변경 감지 | 변경 알림 + 노트 병합 워크플로우 | ⏳ |
| 2-4 | Jobdori 검색 | 사이트 검색 → 수동 추가 | ✅ |
| 2-5 | Jobdori 동기화 UI 페이지 | 연결 상태, 동기화 실행, 이력 표시 | ✅ |

### Phase 3: 시각화 + 타임라인
| 단계 | 작업 | 설명 |
|------|------|------|
| 3-1 | 관계도 시각화 | React Flow 기반 인터랙티브 네트워크 |
| 3-2 | 타임라인 뷰 | 이벤트 기반 시간순 표시 |
| 3-3 | 대시보드 | 전체 현황 요약 위젯들 |

### Phase 4: AI 연동
| 단계 | 작업 | 설명 |
|------|------|------|
| 4-1 | Claude API 연동 | 기본 API 통신 설정 |
| 4-2 | 텍스트 자동 구조화 | 자유 입력 → 카테고리별 분류 |
| 4-3 | 스크린샷 분석 | 이미지 업로드 → Vision API 분석 |
| 4-4 | **AI 인사이트 페이지** | **연쇄 드롭다운 (사이트/인물) + 선택적 배치 분석 + 결과 표시** |

### Phase 5: 옵시디언 연동
| 단계 | 작업 | 설명 |
|------|------|------|
| 5-1 | Vault 설정 | Google Drive 내 Vault 생성/선택 |
| 5-2 | 노트 자동 생성 | 사이트/인물 노트 마크다운 생성 |
| 5-3 | 노트 병합 | 도메인 변경 시 노트 병합 로직 |
| 5-4 | 증거 파일 관리 | 이미지 저장 + 노트 내 임베드 |
| 5-5 | 옵시디언에서 열기 | URI 스킴으로 옵시디언 직접 열기 |

### Phase 6: 마무리
| 단계 | 작업 | 설명 |
|------|------|------|
| 6-1 | 검색 + 필터링 | 전역 검색, 고급 필터 |
| 6-2 | 증거 관리 강화 | 갤러리 뷰, 메타데이터 |
| 6-3 | 설정 페이지 | DB 경로, API 키, Vault 경로 설정 |
| 6-4 | macOS 빌드 | DMG 패키징, 코드 서명 |

---

## 9. 현재 구현 상태 (2026-02-18)

### 완료된 기능
- **Phase 1 전체**: Electron + React + Vite + TypeScript 셋업, SQLite DB 스키마 (13 테이블), 전체 IPC 핸들러, preload bridge, 사이드바 네비게이션, 다크 테마
- 대시보드: 사이트/인물 통계, 최근 활동 타임라인
- 사이트 관리: 목록(검색/필터), 추가 모달, 상세 페이지(편집/삭제, 인프라정보/연관인물/타임라인/도메인이력 탭)
- 인물 관리: 카드 그리드(검색/필터), 추가 모달, 상세 페이지(편집/삭제, 인프라정보/관련사이트/인물관계 탭)
- OSINT 정보 입력: 11개 카테고리, 신뢰도, 핵심 증거 표시
- 설정 페이지: 앱 정보, Obsidian/Jobdori/AI 설정 (플레이스홀더)
- 웹 프리뷰: Mock API (메모리 기반 샘플 데이터, 전체 CRUD 동작)
- **탭 이름 변경**: 'OSINT 정보' → '인프라 정보' (사이트/인물 상세 페이지 모두)
- **연관 인물 상세 카드**: 사이트 상세 페이지에서 연관 인물의 OSINT 정보를 확장/축소 카드로 표시

### Phase 2 진행 상태
- Jobdori 연동 모듈 (jobdoriDB.ts): Neon PostgreSQL 읽기 전용 연결
- 동기화 엔진: 최상위 타겟/OSINT 조사 필요 사이트 자동 추가, 상태 동기화
- Jobdori 동기화 UI 페이지 (JobdoriSyncPage.tsx): 연결 상태, 동기화 실행/옵션, 사이트 조회/검색, 동기화 이력
- Mock API에 Jobdori 관련 메서드 추가 (connect, status, disconnect, sync, syncHistory, search, sitesByRecommendation, envPath)
- **미완료**: 도메인 변경 이력 탐지 및 병합 기능, 라우터에 JobdoriSyncPage 미등록

### 미활성 사이드바 메뉴 (disabled: true)
- 🔗 관계도 (Phase 3)
- 📅 타임라인 (Phase 3)
- 🤖 AI 인사이트 (Phase 4)
- 🔄 Jobdori 동기화 (Phase 2 - 페이지는 구현됐으나 라우터 미등록)

---

## 10. 사용자 커뮤니케이션 규칙

Hub Instructions에 따라:
1. **새 기능 추가 시**: 완전한 맥락 이해를 위한 추가 질문 → 기능 정리 후 사용자 확인 → 설계서 + 개발 계획서 제출 → 승인 후 개발 시작
2. **오류 발견 시**: 발생 가능한 시나리오 3가지 + 각 발생 가능성 + 해결 방법 제공
3. **.env 파일 필요 시**: 사용자에게 위치 알려주고 직접 작성 요청
4. **비개발자 사용자**: 기술 용어(SitesPage, SiteDetailPage 등) 사용 자제. "사이트 목록 화면", "사이트 상세 화면" 등 쉬운 표현 사용
5. **Phase별 진행**: 각 Phase 끝날 때 보고하고 다음 단계 진행 승인 받기

---

## 11. 프로젝트 파일 구조

```
webapp/
├── electron/
│   ├── database.ts         # SQLite DB 초기화 + 13 테이블 스키마
│   ├── main.ts             # Electron main process (IPC 핸들러 전체)
│   └── preload.ts          # contextBridge API 노출
├── src/
│   ├── App.tsx             # 라우팅 (/, /sites, /sites/:id, /persons, /persons/:id, /settings)
│   ├── main.tsx            # React 엔트리포인트 + mock API 초기화
│   ├── components/
│   │   └── Layout.tsx      # 사이드바 + 메인 콘텐츠 레이아웃
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── SitesPage.tsx
│   │   ├── SiteDetailPage.tsx    # 인프라정보/연관인물/타임라인/도메인이력 탭
│   │   ├── PersonsPage.tsx
│   │   ├── PersonDetailPage.tsx  # 인프라정보/관련사이트/인물관계 탭
│   │   ├── SettingsPage.tsx
│   │   └── JobdoriSyncPage.tsx   # Jobdori 동기화 UI (라우터 미등록 상태)
│   ├── lib/
│   │   └── mockElectronAPI.ts    # 웹 프리뷰용 mock API + 샘플 데이터
│   ├── shared/
│   │   └── types.ts              # 전체 TypeScript 타입 정의 + ElectronAPI 인터페이스
│   └── styles/
│       └── globals.css           # TailwindCSS 기반 다크 테마 스타일
├── index.html
├── package.json
├── vite.config.ts                # 웹 프리뷰용 (Electron 플러그인 제거)
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

---

## 12. 현재 미해결 작업 (이 세션에서 요청된 것)

### 요청 1: AI 인사이트 페이지 - 연쇄 드롭다운 UI
**원래 요청 내용 (사용자 원문)**:
> "🔍 [manhwa-es.com ▼] (또는 인물 선택 드롭다운) 부분에 앞에 사이트/인물 드롭다운을 넣고, 선택된 필터에 맞게 사이트 선택 드롭다운 및 인물 선택 드롭다운이 동적으로 표시되도록 해 주세요."

**이것은 AI 인사이트 페이지에 대한 요청**:
- 사이드바의 "🤖 AI 인사이트" 메뉴를 활성화
- AI 인사이트 페이지 생성
- 연쇄 드롭다운: [사이트 ▼] → [manhwa-es.com ▼] → [분석 실행]
- 또는: [인물 ▼] → [DarkWebtoon ▼] → [분석 실행]
- 선택한 대상만 AI 분석 (토큰 절약)
- 분석 결과 카드 표시 + 확인/기각 처리
- 과거 인사이트 이력 표시

### 요청 2: Phase 2 계속 진행
- JobdoriSyncPage를 라우터에 등록
- 사이드바에서 Jobdori 동기화 메뉴 활성화
- 도메인 변경 감지 기능 완성

---

## 13. SQLite 스키마 (핵심 참조)

테이블 목록: sites, domain_history, site_groups, site_group_members, persons, person_site_relations, person_relations, osint_entries, evidence_files, timeline_events, ai_insights, tags, entity_tags, sync_logs, app_settings

ai_insights 테이블 (AI 인사이트 페이지 핵심):
```sql
CREATE TABLE ai_insights (
  id TEXT PRIMARY KEY,
  insight_type TEXT NOT NULL,       -- 'connection', 'pattern', 'anomaly', 'recommendation'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  related_entities TEXT,            -- JSON: [{type, id, name}]
  confidence REAL,                  -- 0.0 ~ 1.0
  status TEXT DEFAULT 'new',        -- 'new', 'reviewed', 'confirmed', 'dismissed'
  ai_model TEXT,
  analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME
);
```

---

## 14. 웹 프리뷰 모드

- 이 샌드박스에서는 Electron을 실행할 수 없음
- `mockElectronAPI.ts`가 모든 Electron IPC 호출을 메모리 기반 Map으로 대체
- Vite dev server로 실행하여 UI 프리뷰 가능
- 데이터는 새로고침 시 리셋됨 (메모리 기반)
- PM2 + vite dev로 3000 포트에서 서비스

---

*이 문서는 세션 간 맥락 유지를 위한 것입니다. 새 세션이 시작되면 이 파일을 먼저 읽어주세요.*
