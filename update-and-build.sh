#!/bin/bash
# ============================================
# Y-EYE Auto Update & Build Script
# 
# Usage:
#   ./update-and-build.sh             # 풀 업데이트 + 빌드 + 앱 실행
#   ./update-and-build.sh --no-launch # 업데이트 + 빌드만 (앱 실행 안 함)
#   ./update-and-build.sh --check     # 업데이트 있는지만 확인
#   ./update-and-build.sh --build-only # Git pull 없이 빌드만 실행
#
# GitHub에서 최신 코드를 가져와 자동으로
# 빌드하고 앱을 실행합니다.
# ============================================

set -e  # 에러 발생 시 즉시 중단

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 옵션 파싱
NO_LAUNCH=false
CHECK_ONLY=false
BUILD_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --no-launch)  NO_LAUNCH=true ;;
    --check)      CHECK_ONLY=true ;;
    --build-only) BUILD_ONLY=true ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --no-launch   업데이트 + 빌드만 (앱 실행 안 함)"
      echo "  --check       업데이트 있는지만 확인"
      echo "  --build-only  Git pull 없이 빌드만 실행"
      echo "  --help, -h    도움말 표시"
      exit 0
      ;;
  esac
done

# 시작 시간 기록
START_TIME=$(date +%s)

echo ""
echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Y-EYE Auto Update & Build        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# 프로젝트 디렉토리로 이동
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 현재 버전 읽기
CURRENT_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

echo -e "${YELLOW}📂 프로젝트 경로: ${SCRIPT_DIR}${NC}"
echo -e "${YELLOW}📌 현재 버전: v${CURRENT_VERSION} (${CURRENT_COMMIT})${NC}"
echo ""

# ---- Check Only Mode ----
if [ "$CHECK_ONLY" = true ]; then
  echo -e "${BLUE}[CHECK]${NC} 🔍 업데이트 확인 중..."
  git fetch origin main 2>/dev/null
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main)
  
  if [ "$LOCAL" = "$REMOTE" ]; then
    echo -e "${GREEN}  ✓ 최신 상태입니다. 업데이트가 필요 없습니다.${NC}"
  else
    BEHIND=$(git rev-list --count HEAD..origin/main)
    echo -e "${YELLOW}  ⚡ ${BEHIND}개의 새 커밋이 있습니다.${NC}"
    echo ""
    echo -e "${CYAN}  최근 변경사항:${NC}"
    git log --oneline HEAD..origin/main | head -10 | while read line; do
      echo -e "    ${line}"
    done
    echo ""
    echo -e "${YELLOW}  → ./update-and-build.sh 로 업데이트하세요.${NC}"
  fi
  echo ""
  exit 0
fi

# ---- Step 1: Git Pull (skip if --build-only) ----
if [ "$BUILD_ONLY" = true ]; then
  echo -e "${YELLOW}[1/5]${NC} ⏭️  Git pull 건너뜀 (--build-only 모드)"
else
  echo -e "${BLUE}[1/5]${NC} 🔄 최신 코드 가져오는 중..."
  
  # 업데이트 전 변경사항 확인
  git fetch origin main 2>/dev/null
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main)
  
  if [ "$LOCAL" = "$REMOTE" ]; then
    echo -e "${GREEN}  ✓ 이미 최신 상태입니다.${NC}"
  else
    BEHIND=$(git rev-list --count HEAD..origin/main)
    echo -e "${CYAN}  📥 ${BEHIND}개의 새 커밋을 가져옵니다...${NC}"
    
    if git pull origin main 2>&1; then
      NEW_COMMIT=$(git rev-parse --short HEAD)
      NEW_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
      echo -e "${GREEN}  ✓ Git pull 완료 (${CURRENT_COMMIT} → ${NEW_COMMIT})${NC}"
      
      if [ "$CURRENT_VERSION" != "$NEW_VERSION" ]; then
        echo -e "${GREEN}  🎉 버전 업데이트: v${CURRENT_VERSION} → v${NEW_VERSION}${NC}"
      fi
    else
      echo -e "${RED}  ✕ Git pull 실패. 네트워크 또는 인증을 확인하세요.${NC}"
      echo -e "${YELLOW}  💡 로컬 변경사항이 있다면: git stash 후 다시 시도하세요.${NC}"
      exit 1
    fi
  fi
fi
echo ""

# ---- Step 2: Install Dependencies ----
echo -e "${BLUE}[2/5]${NC} 📦 의존성 설치 중..."
if npm install 2>&1 | tail -3; then
  echo -e "${GREEN}  ✓ npm install 완료${NC}"
else
  echo -e "${RED}  ✕ npm install 실패${NC}"
  exit 1
fi
echo ""

# ---- Step 3: Clean Previous Build ----
echo -e "${BLUE}[3/5]${NC} 🧹 이전 빌드 정리 중..."
rm -rf dist dist-electron release
echo -e "${GREEN}  ✓ 빌드 폴더 정리 완료${NC}"
echo ""

# ---- Step 4: Build ----
echo -e "${BLUE}[4/5]${NC} 🔨 빌드 중... (시간이 걸릴 수 있습니다)"
export CSC_IDENTITY_AUTO_DISCOVERY=false
export ELECTRON=1

# TypeScript 체크 (선택적 — 실패해도 빌드 진행)
echo -e "${CYAN}  [4a] TypeScript 체크...${NC}"
npx tsc --noEmit 2>&1 | tail -5 || {
  echo -e "${YELLOW}  ⚠️ TypeScript 경고가 있으나 빌드를 계속합니다.${NC}"
}

# Vite + Electron 빌드
echo -e "${CYAN}  [4b] Vite 빌드...${NC}"
if npx vite build 2>&1 | tail -5; then
  echo -e "${GREEN}  ✓ Vite 빌드 완료${NC}"
else
  echo -e "${RED}  ✕ Vite 빌드 실패${NC}"
  exit 1
fi

# Electron Builder
echo -e "${CYAN}  [4c] Electron 패키징...${NC}"
if npx electron-builder --mac 2>&1 | tail -5; then
  echo -e "${GREEN}  ✓ Electron 빌드 완료${NC}"
else
  echo -e "${RED}  ✕ Electron 빌드 실패${NC}"
  exit 1
fi
echo ""

# ---- Step 5: Launch ----
APP_PATH=""
if [ -d "release/mac-arm64/Y-EYE.app" ]; then
  APP_PATH="release/mac-arm64/Y-EYE.app"
elif [ -d "release/mac/Y-EYE.app" ]; then
  APP_PATH="release/mac/Y-EYE.app"
fi

# 소요 시간 계산
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
MINUTES=$((ELAPSED / 60))
SECONDS=$((ELAPSED % 60))

if [ -n "$APP_PATH" ]; then
  FINAL_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
  
  echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ 업데이트 & 빌드 완료!             ║${NC}"
  echo -e "${GREEN}╠══════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║  버전: v${FINAL_VERSION}                         ║${NC}"
  echo -e "${GREEN}║  소요: ${MINUTES}분 ${SECONDS}초                           ║${NC}"
  echo -e "${GREEN}║  경로: ${APP_PATH}${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
  
  if [ "$NO_LAUNCH" = true ]; then
    echo ""
    echo -e "${YELLOW}  앱 실행이 건너뛰어졌습니다 (--no-launch).${NC}"
    echo -e "${YELLOW}  수동 실행: open \"${APP_PATH}\"${NC}"
  else
    echo ""
    echo -e "${BLUE}[5/5]${NC} 🚀 앱 실행 중..."
    
    # 기존 Y-EYE 프로세스 종료 (있으면)
    pkill -f "Y-EYE" 2>/dev/null || true
    sleep 1
    
    open "$APP_PATH"
    echo -e "${GREEN}  ✓ Y-EYE가 실행되었습니다.${NC}"
  fi
else
  echo -e "${YELLOW}[5/5]${NC} ⚠️  앱 파일을 찾을 수 없습니다."
  echo "  release/ 폴더를 확인하세요:"
  ls -la release/ 2>/dev/null || echo "  (release 폴더 없음)"
  echo ""
  echo -e "${YELLOW}  빌드 소요: ${MINUTES}분 ${SECONDS}초${NC}"
fi
echo ""
