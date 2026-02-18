# Y-EYE - OSINT Intelligence Platform

불법 웹툰 사이트 운영자 추적을 위한 OSINT 수사 관리 플랫폼

## Project Overview
- **Name**: Y-EYE
- **Goal**: 저작권 침해 불법 웹툰 사이트 운영자 식별 및 추적을 위한 OSINT 수사 자료 통합 관리
- **Platform**: Electron (macOS 전용) 데스크톱 앱 + 웹 프리뷰 모드

## Tech Stack
- **Frontend**: React 18 + TypeScript + TailwindCSS
- **Backend**: Electron (IPC) + better-sqlite3
- **Build**: Vite + electron-builder
- **Data Storage**: SQLite (로컬)
- **Web Preview**: Vite + serve (Mock API 기반 프리뷰)

## Current Status: Phase 1 Complete

### Implemented Features (Phase 1)
- Electron + React + Vite + TypeScript 프로젝트 구조
- SQLite 데이터베이스 스키마 (13개 테이블, 인덱스 포함)
- IPC 핸들러: 모든 CRUD 작업 (Sites, Persons, OSINT, Evidence, Timeline, Tags, Groups)
- Preload 브릿지: Context Isolation 보안 적용
- **대시보드**: 현황 요약 (사이트/인물/조사 통계, 최근 활동)
- **사이트 관리**: 목록 조회, 검색/필터, 추가, 상세 페이지 (편집/삭제)
- **인물 관리**: 목록 조회 (카드 그리드), 검색/필터, 추가, 상세 페이지
- **OSINT 정보**: 카테고리별 입력 (WHOIS, IP, DNS, SSL, 이메일, SNS, 결제, 호스팅, 애널리틱스, 스크린샷, 기타)
- **사이트 상세**: OSINT 탭, 연관 인물 탭, 타임라인 탭, 도메인 이력 탭
- **인물 상세**: OSINT 탭, 관련 사이트 탭, 인물 관계 탭
- **설정**: 앱 정보, Obsidian/Jobdori/AI 설정 (Phase별 구현 예정 표시)
- **웹 프리뷰 모드**: Mock Electron API + 샘플 데이터로 브라우저에서 UI 확인 가능
- TailwindCSS 다크 테마, macOS 네이티브 타이틀바

### Not Yet Implemented
- **Phase 2**: Jobdori Neon DB 읽기 전용 연동, 자동 동기화, 도메인 변경 감지
- **Phase 3**: 관계도 시각화 (D3.js/React Flow), 전체 타임라인, 대시보드 고급 기능
- **Phase 4**: Claude AI 연동 (텍스트 자동 분류, 스크린샷 Vision, AI 인사이트 페이지)
- **Phase 5**: Obsidian Vault 자동 생성, 노트 병합, 증거 관리, URI 스킴 연동
- **Phase 6**: 고급 검색/필터, macOS DMG 패키징, 코드 서명

## Project Structure
```
webapp/
├── electron/
│   ├── main.ts          # Electron 메인 프로세스 (IPC 핸들러)
│   ├── preload.ts       # Context Isolation 브릿지
│   └── database.ts      # SQLite 데이터베이스 초기화 및 스키마
├── src/
│   ├── App.tsx           # React Router 설정
│   ├── main.tsx          # 앱 진입점 (Mock API 자동 주입)
│   ├── components/
│   │   └── Layout.tsx    # 사이드바 + 메인 레이아웃
│   ├── lib/
│   │   └── mockElectronAPI.ts  # 웹 프리뷰용 Mock API
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── SitesPage.tsx
│   │   ├── SiteDetailPage.tsx
│   │   ├── PersonsPage.tsx
│   │   ├── PersonDetailPage.tsx
│   │   └── SettingsPage.tsx
│   ├── shared/
│   │   └── types.ts      # TypeScript 타입 정의 + 상수
│   └── styles/
│       └── globals.css   # TailwindCSS + 커스텀 스타일
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── ecosystem.config.cjs  # PM2 설정 (웹 프리뷰)
```

## Data Models (SQLite)
| Table | Description |
|-------|------------|
| sites | 조사 대상 사이트 (도메인, 유형, 상태, 우선순위, Jobdori 연동) |
| domain_history | 도메인 변경 이력 |
| site_groups / site_group_members | 연관 도메인 그룹 |
| persons | 운영자/인물 프로파일 |
| person_site_relations | 인물-사이트 연결 (역할, 신뢰도, 증거) |
| person_relations | 인물-인물 관계 |
| osint_entries | OSINT 정보 항목 (카테고리, 내용, 출처, 신뢰도) |
| evidence_files | 증거 자료 (파일, AI 분석 결과) |
| timeline_events | 타임라인 이벤트 |
| ai_insights | AI 분석 결과 |
| tags / entity_tags | 태그 시스템 |
| sync_logs | Jobdori 동기화 로그 |
| app_settings | 앱 설정 |

## Development

### Web Preview (Sandbox / Browser)
```bash
npm install
WEB_PREVIEW=1 npx vite build
npx serve dist -l 3000 -s
```

### Electron Development (로컬 Mac)
```bash
npm install
npm run electron:dev
```

### Electron Build (macOS DMG)
```bash
npm run electron:build
# → release/ 폴더에 .dmg 파일 생성
```

## Routes
| Path | Page | Description |
|------|------|------------|
| / | DashboardPage | 현황 요약 대시보드 |
| /sites | SitesPage | 사이트 목록 (검색, 필터, 추가) |
| /sites/:id | SiteDetailPage | 사이트 상세 (OSINT, 인물, 타임라인, 도메인 이력) |
| /persons | PersonsPage | 인물 목록 (검색, 필터, 추가) |
| /persons/:id | PersonDetailPage | 인물 상세 (OSINT, 관련 사이트, 인물 관계) |
| /settings | SettingsPage | 환경 설정 |
| /network | - | 관계도 (Phase 3) |
| /timeline | - | 타임라인 (Phase 3) |
| /ai-insights | - | AI 인사이트 (Phase 4) |
| /jobdori | - | Jobdori 동기화 (Phase 2) |

## Last Updated
Phase 1 - 2026-02-18
