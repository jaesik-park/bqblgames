# Z-Squad (프로토타입)

LastZ 스타일의 좀비 생존 게임을 웹으로 만든 세로 화면 프로토타입입니다.
Vite + TypeScript + Canvas 2D로 만들었고 게임 엔진 의존성이 없습니다.
나중에 Capacitor로 감싸서 iOS/Android 앱으로 출시할 수 있게 구성했습니다.

## 실행

```bash
cd zombie-squad
npm install
npm run dev        # http://localhost:5173 (같은 Wi-Fi의 휴대폰에서도 접속 가능)
npm run build      # dist/ 에 정적 파일 생성
```

## 게임 구성

| 화면 | 내용 |
| --- | --- |
| 🏠 기지 | 본부·농장·벌목장·제철소·훈련소·연구소. 자원 자동 생산 → 탭해서 수령, 건설 타이머(건설대 1개), 다이아로 즉시 완료. 다른 건물은 본부 레벨을 넘을 수 없음 |
| ⚔️ 출격 | 러너 슈팅 전투. 드래그로 분대 이동, 자동 사격, 파란/빨간 게이트로 병력 증감(게이트를 쏘면 숫자 상승), 마지막에 보스 |
| 🦸 영웅 | 다이아로 모집(R/SR/SSR), 중복 시 ★ 상승, 레벨업, 최대 3명 분대 편성. 영웅마다 공격력·연사·시작 병력·피해 감소 특성 |

진행 상황은 `localStorage`에 저장됩니다(출격 화면 하단의 "데이터 초기화"로 리셋).

## 코드 구조

```
src/
  data.ts    건물·영웅·자원 정의 (밸런스 숫자는 대부분 여기)
  state.ts   세이브 데이터 구조, 저장/불러오기
  logic.ts   생산·업그레이드·모집·전투 스탯·보상 계산 (DOM 없음)
  battle.ts  Canvas 전투 엔진 (스테이지 생성, 충돌, 렌더링)
  main.ts    화면(UI) 렌더링과 이벤트 처리
  style.css  모바일 세로 레이아웃 (safe-area 대응)
```

## 모바일 앱 (Capacitor)

Capacitor 설정과 네이티브 프로젝트가 이미 들어 있습니다.

- 앱 ID: `com.bqblgames.zsquad` (마켓에 한 번 올리면 바꿀 수 없으니 출시 전에 확정하세요 → `capacitor.config.ts`, `android/app/build.gradle`, Xcode)
- `android/` — Android Studio 프로젝트 (세로 고정, minSdk 24 / targetSdk 36)
- `ios/` — Xcode 프로젝트 (세로 고정)
- `assets/` — 아이콘·스플래시 원본. 바꾼 뒤 `npx @capacitor/assets generate --android --ios --iconBackgroundColor '#14171c' --splashBackgroundColor '#14171c'`

웹 코드를 고친 뒤에는 항상:

```bash
npm run build && npx cap sync
npx cap open android   # Android Studio (실행 ▶ 버튼으로 휴대폰에 설치)
npx cap open ios       # Xcode (Mac 필요)
```

### GitHub Actions 자동 빌드

`zombie-squad/`가 바뀐 커밋을 푸시하면 **Android build** 워크플로가 돌아서 결과물을 올려 줍니다.
GitHub 저장소 → Actions → 해당 실행 → 하단 *Artifacts*에서 내려받으세요.

| 결과물 | 용도 |
| --- | --- |
| `z-squad-debug-apk` | 휴대폰에 바로 설치해서 테스트 (zip을 풀고 `.apk` 실행, "출처를 알 수 없는 앱" 허용 필요) |
| `z-squad-release-aab` | Google Play Console 업로드용. 아래 서명 시크릿이 있어야 서명된 파일이 됩니다 |

`versionCode`는 실행 번호(`github.run_number`)로 자동 증가합니다.

**iOS build check** 워크플로는 수동 실행(Actions → Run workflow)이며 서명 없이 시뮬레이터용으로 컴파일만 확인합니다.
App Store 제출용 빌드는 Mac의 Xcode에서 Product → Archive로 만듭니다.

### 안드로이드 출시 서명 설정 (한 번만)

```bash
keytool -genkey -v -keystore release.keystore -alias zsquad -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore > release.keystore.b64   # macOS: base64 -i release.keystore
```

GitHub 저장소 → Settings → Secrets and variables → Actions에 추가:

| 이름 | 값 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `release.keystore.b64` 내용 |
| `ANDROID_KEYSTORE_PASSWORD` | 키스토어 비밀번호 |
| `ANDROID_KEY_ALIAS` | `zsquad` |
| `ANDROID_KEY_PASSWORD` | 키 비밀번호 |

⚠️ `release.keystore` 파일과 비밀번호는 저장소에 올리지 말고 안전한 곳에 백업하세요.
Play 앱 서명을 쓰면 이 키는 "업로드 키"가 되어 분실 시 재설정할 수 있지만, 그래도 잃어버리지 않는 게 좋습니다.

## 다음 단계 아이디어

- 스프라이트/사운드 에셋, 히트 이펙트
- 서버 저장(계정), 결제·광고(AdMob — 루트의 `app-ads.txt`와 연동)
- 연맹, 월드맵, PvP 등 LastZ의 SLG 요소
