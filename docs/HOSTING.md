# 호스팅과 배포

## 공개 게임

**https://weodlf.github.io/exit-north/**

GitHub Pages 배포를 완료했다. [배포 실행 41025240762](https://github.com/weodlf/exit-north/actions/runs/41025240762)이 성공했고 공개 HTML이 HTTP 200으로 응답한다. 배포된 파일은 저장소의 빌드와 SHA-256이 일치한다.

```text
a22d941fe25fdef9b4bc81777c0a1b2c026416fe1f92dae226b0d1dfefbdec89
```

2026-10-30 17:20:49 KST에 Chromium + SwiftShader로 공개 주소를 검사했다. 리깅 캐릭터·4개 클립, WASD 이동·비용·E 조사·라디오 획득, 인벤토리·음식 소비, 새로고침 후 상태 복원, 390px 모바일 방향 패드·레이아웃, 실제 DOM 선택으로 6장 완주를 확인했다. JS 예외·실패 요청·외부 런타임 요청은 없었다. 관리형 프록시의 기존 CA를 검증 브라우저가 신뢰하도록 구성했으며 TLS 인증서 검증은 유지했다. [검증 보고](VERIFICATION.md).

## 재배포

`.github/workflows/pages.yml`은 `main`의 `index.html` 또는 워크플로 파일 변경을 push하면 자동 실행한다. 데이터·코드 수정 후 `npm run build`로 생성한 HTML을 함께 커밋해야 한다. 문서만 수정하면 배포를 시작하지 않는다. 배포 아티팩트는 단일 HTML이며 공개 저장소의 소스·모델은 GitHub에서 별도로 열람할 수 있다.

[배포 워크플로](https://github.com/weodlf/exit-north/actions/workflows/pages.yml)의 **Run workflow**에서 `main`을 선택해 수동 실행하거나 CLI를 사용한다.

```sh
gh workflow run pages.yml --repo weodlf/exit-north --ref main
gh run list --repo weodlf/exit-north --workflow pages.yml --limit 3
```

최초에는 Pages 미활성화로 실패했고 API 활성화도 연결 권한 부족(HTTP 403)으로 거부되었다. 사용자가 [Settings → Pages](https://github.com/weodlf/exit-north/settings/pages)의 **Build and deployment → Source → GitHub Actions**를 선택한 뒤 재실행하여 해결했다. 새 저장소에서도 최초 1회 이 설정이 필요하다. 비밀 토큰을 채팅으로 전달할 필요는 없다.

배포마다 실행 성공·실제 URL·HTTP 200·파일 일치 여부·브라우저 동작을 확인한다. Pages에는 Node 서버용 `/healthz`가 없으므로 게임의 루트 URL을 확인한다.

## 개발 서버와 다른 호스트

Sites 게시 도구는 현재 세션에 제공되지 않아 GitHub Pages를 사용했다. Three.js·GLB·데이터를 내장한 `index.html`을 다른 HTTPS 정적 호스트에도 배치할 수 있다. DB·API 키·CDN은 필요 없다.

개발용 Node 서버는 아래 명령으로 실행한다. 기본 바인딩은 `0.0.0.0:3000`이고 `/`와 `/healthz`에 응답한다. 포트가 사용 중이면 `PORT=3001 npm start` 등으로 변경한다. 이 개발 서버는 작업 머신의 수명에 종속되며 공개 Pages 사이트는 별도로 제공된다.

```sh
cd /workspace/exit-north
npm ci
npm run build
npm start
```

진행 저장은 브라우저 origin에 묶인다. 도메인을 변경하면 기존 저장이 자동 이전되지 않는다. 추후 Unity WebGL이나 분리 자산으로 전환하면 WASM MIME, 압축 헤더, CORS, COOP/COEP 등 필요한 호스팅 설정을 별도로 검증해야 한다.
