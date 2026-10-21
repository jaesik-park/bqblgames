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

## 모바일 앱으로 패키징 (Capacitor)

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "Z-Squad" com.bqblgames.zsquad --web-dir dist
npm run build
npx cap add android && npx cap add ios
npx cap sync
npx cap open android   # Android Studio에서 빌드
```

`vite.config.ts`의 `base: './'` 덕분에 WebView에서도 경로가 깨지지 않습니다.

## 다음 단계 아이디어

- 스프라이트/사운드 에셋, 히트 이펙트
- 서버 저장(계정), 결제·광고(AdMob — 루트의 `app-ads.txt`와 연동)
- 연맹, 월드맵, PvP 등 LastZ의 SLG 요소
