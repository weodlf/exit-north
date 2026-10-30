# 북쪽의 끝에서 · EXIT NORTH

탈북을 모티프로 한 **6장 3인칭 3D 서바이벌 내러티브 웹 게임**입니다. HP·허기·자금·은밀도로 선택을 계산하고, 장면 데이터와 생존 규칙, 화면을 각각 분리했습니다. 인물·이동 경로·확률·대화는 허구입니다.

**현재 버전 0.2:** 직접 제작한 리깅 캐릭터, 걷기·달리기·은신, 캐릭터 추적 카메라, 미니맵, 가까운 사물 E 조사, 이동에 따른 생존 비용을 구현했습니다. [3인칭 조작·모델링 안내](docs/THIRD-PERSON.md).

**바로 실행:** [`index.html`](index.html)을 브라우저로 열면 됩니다. Three.js·모델·데이터를 내장했으며 런타임 CDN·API·외부 모델 요청이 없는 단일 파일입니다. 파일 실행 시 저장 정책은 브라우저마다 다르므로 지속적인 플레이에는 HTTP 서버를 권장합니다.

**공개 배포:** GitHub Pages 워크플로를 저장소에 반영했습니다. 최초 1회 [Pages 설정](https://github.com/weodlf/exit-north/settings/pages)의 **Build and deployment → Source → GitHub Actions**를 선택해야 합니다. 현재 연결은 이 설정 변경을 HTTP 403으로 거부당했으며, 아직 공개 배포를 완료하지 못했습니다. 활성화 후 [배포 워크플로](https://github.com/weodlf/exit-north/actions/workflows/pages.yml)를 실행하세요. [배포 상태와 절차](docs/HOSTING.md).

```sh
cd /workspace/exit-north
npm start
# 기본: 0.0.0.0:3000 / PORT, HOST로 변경 가능
```

앱은 `/`, `/index.html`, 상태 확인은 `/healthz`로 제공합니다. 서버는 소스·저장소·비밀 파일을 공개하지 않습니다. 이 클라우드 머신의 열린 포트가 인터넷 공개 주소를 자동 생성하지는 않습니다.

## 제작 결과물

| 결과물 | 파일 | 내용 |
|---|---|---|
| 현재 3D 버전 | [docs/THIRD-PERSON.md](docs/THIRD-PERSON.md) | 조작, 모델링, 공간 데이터, 이동 비용, 검증·Sites 상태 |
| 종합 기획서 | [docs/DESIGN.md](docs/DESIGN.md) | 콘셉트, 6장 구성, 비용·확률·밸런스, UI/UX, 제작 범위 |
| 시스템 구조 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 처리 순서, 상태·이벤트 계약, 저장, 모듈·컴포넌트 구조 |
| 글로벌 상태 JSON Schema | [schemas/game-state.schema.json](schemas/game-state.schema.json) | Draft-07, 범위·상태 제약, `additionalProperties: false` |
| 이벤트 JSON Schema | [schemas/events.schema.json](schemas/events.schema.json) | 비용·요구조건·보상·확률·3D 메타데이터 |
| 1·3장 데이터 해설 | [docs/EVENTS.md](docs/EVENTS.md) | 실제 데이터에서 발췌한 완전한 노드와 계산 예시 |
| 전체 게임 데이터 | [data/events.json](data/events.json) | 6장·14개 노드·선택지·아이템·장면 레지스트리 |
| 초기 상태 예제 | [data/initial-state.example.json](data/initial-state.example.json) | 직렬화 가능한 글로벌 상태 |
| 실행 프로토타입 | [index.html](index.html) | HTML/CSS/JS/JSON을 내장한 단일 파일 |
| 3D 확장 가이드 | [docs/3D-EXTENSION.md](docs/3D-EXTENSION.md) | Three.js/Unity, 챕터별 카메라, 객체·명령 매핑, 오버레이 |
| 호스팅 안내 | [docs/HOSTING.md](docs/HOSTING.md) | 현재 서버, 재시작, Pages 워크플로, 공개 배포 조건 |
| 검증·수정 보고 | [docs/VERIFICATION.md](docs/VERIFICATION.md) | 실제 확인 범위, 수정 내용, 제한 |

## 개발과 검증

Node.js 22 이상이 필요합니다. 이 환경에서는 Node.js 24.19.0을 사용했습니다. Three.js는 실행 페이지에 번들하고 esbuild로 조립합니다. Ajv·Playwright Core는 검증 도구이며 실행 페이지에 포함하지 않습니다. 캐릭터 GLB를 제공하므로 일반 설치에 Blender는 필요하지 않습니다.

```sh
npm ci
npm run build          # src + data → 동일한 단일 index.html
npm test               # 엔진, 상태/이벤트 스키마, 그래프, 완주 경로
npm run test:browser   # Chromium의 실제 DOM·모바일·저장·6장 플레이
npm run check          # 빌드 + 위 두 검증
```

브라우저 테스트는 시스템 Chromium과 SwiftShader로 WebGL을 렌더링합니다. 다른 위치라면 `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:browser`로 지정하세요. 브라우저가 없으면 테스트가 실패하며, 건너뛴 검증을 통과로 처리하지 않습니다. 스크린샷은 무시된 `artifacts/screenshots/`에 생성됩니다.

`data/events.json`에서 비용·대사·아이템·확률을 수정하고 빌드하세요. `index.html`은 생성물입니다. 소스 변경 후 재빌드해야 페이지에 반영됩니다. 저장 포맷·데이터가 호환되지 않는 변경에는 `revision`을 올려 기존 저장이 잘못 적용되는 일을 막습니다.

## 조작과 규칙

- 3D: WASD 이동, 드래그 시점, Shift 달리기, C 은신, E 조사, I 가방. 모바일 방향 패드 지원.
- 텍스트 모드: 선택지 클릭 또는 숫자 1–4. Space로 타이핑 생략. 대화상자는 Escape로 닫습니다.
- 이동 2m 구간에도 방식별 비용이 있습니다. 모든 행동은 HP를 소모하고 허기를 높입니다. 행동력(AP)은 없습니다.
- 비용 적용 후 허기 100이면 그 행동부터 HP −5. HP 0은 즉시 게임 오버입니다.
- 물품 사용도 HP −1·허기 +2 후 아사 판정을 거쳐 회복합니다.
- 진행은 브라우저의 `localStorage`에 자동 저장합니다. 서버에는 개인별 상태를 저장하지 않습니다.
- 6장 진입 후 생존 판정은 끝나고 에필로그와 ‘진실의 방’을 읽습니다.

이 클라우드 작업은 이미 격리되어 있으므로 현재 체크아웃을 그대로 사용합니다. 별도 Git worktree는 필요하지 않습니다.
