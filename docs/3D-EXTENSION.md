# 3D 확장 가이드 — Three.js / Unity WebGL

현재 0.2에는 실제 Three.js 3인칭 렌더러와 리깅된 캐릭터가 구현되어 있다. 현재 조작·모델·이동 비용은 [THIRD-PERSON.md](THIRD-PERSON.md)를 참고한다. 아래는 Unity 전환과 추가 카메라 프리셋을 위한 확장 계약이다. 현재 모든 노드는 `third_person_follow`를 사용하며, 표의 장별 다른 시점은 후속 프리셋 제안이다.

## 1. 캔버스와 HTML의 오버레이

현재 DOM의 교체 지점에는 WebGL 캔버스가 장착되며 텍스트 모드에서는 SVG를 사용한다.

```html
<section class="scene-frame">
  <div id="viewport" class="viewport-layer" aria-hidden="true">
    <!-- 현재: SVG. 교체: Three.js canvas 또는 Unity WebGL canvas -->
  </div>
  <div class="scene-vignette"></div>
  <div class="scene-grain"></div>
  <div id="scene-overlay" class="scene-ui-layer">
    <!-- 챕터, 장소, 제목, 본문, 타이핑 생략 버튼 -->
  </div>
</section>
<!-- 선택지·스탯·인벤토리도 GameHost의 HTML 형제로 유지 -->
```

```css
.scene-frame { position: relative; isolation: isolate; min-height: 425px; overflow: hidden; }
.viewport-layer { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.viewport-layer canvas { width: 100%; height: 100%; pointer-events: auto; touch-action: none; }
.scene-vignette { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
.scene-grain { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.scene-ui-layer { position: relative; z-index: 3; pointer-events: none; }
.scene-ui-layer button, .scene-ui-layer a { pointer-events: auto; }
```

장식·본문 영역은 캔버스의 입력을 가로채지 않고 실제 HTML 컨트롤만 클릭을 받는다. `isolation`으로 캔버스의 stacking context를 해당 장면 안에 가둔다. 로더가 캔버스를 `body`에 직접 붙이거나 fixed 전체 화면으로 만들지 않도록 한다. 전체 화면을 제공할 경우 캔버스 하나가 아니라 **HUD까지 포함한 SceneFrame/GameHost 래퍼**를 전체 화면으로 전환한다.

3D의 주 상호작용이 객체 클릭이어도 동일한 HTML 선택지를 유지한다. 키보드·스크린리더·WebGL 미지원 기기에서 진행이 막히지 않아야 한다. 스탯·허기·선택 가능 여부는 Three.js/Unity 내부에 복제하지 않는다.

## 2. 공통 장면 계약

이벤트의 `scene_3d`는 `world.scenes`의 키이며, `camera_mode`는 카메라 리그 선택값이다. 배포 URL이나 엔진 인스턴스를 게임 상태에 저장하지 않는다.

```json
{
  "id": "ch3.bank",
  "scene_3d": "frozen_river",
  "camera_mode": "overhead_crossing"
}
```

```json
{
  "frozen_river": {
    "environment": "river",
    "assetKey": "environments/frozen-river",
    "spawn": "near_bank",
    "lighting": "moon_searchlight",
    "hotspots": ["observe", "ice_crossing", "broker"]
  }
}
```

`assetKey`는 논리 이름이다. 별도의 에셋 매니페스트가 Three.js의 GLB·텍스처와 Unity Addressables/Scene 이름으로 해석한다. `spawn`·`hotspots`는 프리팹/GLTF 노드 이름의 계약이며, 현재 에셋 파일이 존재한다는 뜻이 아니다. 에셋 검사기는 매니페스트와 오브젝트 이름을 검증하도록 후속 추가한다.

두 엔진의 좌표는 매니페스트에서 변환한다. Three.js는 Y-up 우수 좌표, Unity는 Y-up 좌수 좌표이며 통일된 논리 좌표를 하나 정하고 Z축 반전과 회전 변환을 로더 경계에서만 수행한다. 두 엔진에서 각각 손으로 다른 스폰 위치를 기록하지 않는다.

## 3. 챕터별 카메라·오브젝트 매핑

아래 시야각·거리는 출발점이며 실제 에셋 크기와 모바일 가독성에 맞춰 조정할 기획값이다.

| 장·장면 키 | 카메라 모드·권장 시점 | 3D 오브젝트 | 현재 선택 명령 매핑 |
|---|---|---|---|
| 1 `home_dawn` | `fixed_inspection`: 고정/준1인칭, perspective 48°, 실내 노드 간 컷 | 장롱·외투·서류·복도 문 | 장롱→`radio`, 외투→`coat`, 서류→`papers`, 문→`leave`/`depart` |
| 2 `labor_yard` | `isometric_survival`: orthographic, 40~50° 내려다보기 | 작업장·배급 상자·벽 | 작업장 메뉴→`labor`/`careful`, 배급→`ration` |
| 2 `labor_tunnel` | 야드 `isometric_survival`, 출구 `third_person_follow`로 전환 | 벽 틈·바위·통로 출구 | 벽→`dig`, 출구 메뉴→`crawl`/`rush` |
| 3 `frozen_river` | `overhead_crossing`: 60~75° 경사 탑다운, 플레이 영역 전체 가시 | 추상화한 얼음·빛 원뿔·안내인 | 빛 관찰→`observe`, 강 메뉴→`sprint`/`sneak`, 안내인→`broker` |
| 3 `river_shelter` | `fixed_inspection`: 안정된 프레이밍 | 창고 상자·도시 출구 | 상자→`search`, 출구→`city` |
| 4 `neon_market` | `third_person_social`: 느린 3인칭, 후방 3~5m·높이 약 2m | 하역 장소·식품 가판대·찻집 문 | 작업→`work`, 식품→`buy`, 찻집→`contact` |
| 4 `neon_teahouse` | `dialogue_closeup`: 정적인 얼굴/손 클로즈업, 35~50° FOV | 소개자 A/B·빈 의자·출구 | 대화 메뉴→`verify`/`trusted`/`cheap`, 출구→`return` |
| 4 `southbound_road` | `third_person_follow`: 차량 안/밖의 짧은 컷 | 차량·도로 출구 | 출구 메뉴→`fast`/`quiet` |
| 5 `monsoon_jungle` | `third_person_follow`: 낮은 후방, 화면 흔들림 최소화 | 보급 처마·갈림길·숲 출구 | 보급→`cache`, 갈림길 메뉴→`river`/`sprint` |
| 5 `mekong_crossing` | `overhead_crossing`: 강의 추상적 공간만 표시 | 물길·일행·반대편 표식 | 물길 메뉴→`slow`/`rush`, 도움→`help` |
| 5 `embassy_gate` | `third_person_follow`: 철문 앞에서 고정 카메라로 감속 | 가상의 철문·초인종·일행 | 철문 메뉴→`run`/`careful`/`together` |
| 6 `settlement_morning` | `first_person_reflection`: 고정 1인칭, 자연광·느린 컷 | 창문·책상·기록장·비어 있는 의자 | 생존 명령 없음. 기록장→HTML ‘진실의 방’ 열기 |

동일한 `choiceId`도 현재 노드와 함께 해석한다. 예를 들어 `careful`은 2장의 노역과 5장의 접근에서 뜻이 다르다. 3D에서 전역 `careful` 핸들러로 처리하지 않고 **현재 노드의 선택 목록**을 보여 주거나 연결한다. `hotspots` 하나에서 여러 선택지를 열 수 있으며, 해제 조건은 엔진의 `availability`만 사용한다.

## 4. 어댑터 수명주기

렌더러 인터페이스는 다음과 같이 맞춘다. 여기의 코드는 적용 예시이며 현재 번들에 WebGL을 추가하지는 않는다.

```js
// 교체 가능한 렌더러의 계약
const adapter = {
  mount({ container, dispatch }) {},
  async loadScene(sceneMetadata, { signal }) {},
  render(snapshot) {},
  resize({ width, height, pixelRatio }) {},
  dispose() {}
};

const host = document.getElementById('viewport');
const bridge = window.ExitNorthBridge;
adapter.mount({ container: host, dispatch: bridge.dispatch });
let pending;
let requestedKey;
let latest = bridge.getSnapshot();
function update(snapshot) {
  latest = snapshot;
  const scene = bridge.getScene();
  const key = `${scene.nodeId}:${scene.scene_3d}:${scene.camera_mode}`;
  if (key === requestedKey) {
    if (!pending) adapter.render(latest);
    return; // 로딩 중에는 최신 스냅샷만 보관한다.
  }
  requestedKey = key;
  pending?.abort();
  const controller = pending = new AbortController();
  Promise.resolve().then(() => adapter.loadScene(scene, {signal: controller.signal}))
    .then(() => {
      if (controller.signal.aborted) return;
      pending = undefined;
      adapter.render(latest);
    })
    .catch(() => {
      if (controller.signal.aborted) return;
      pending = undefined;
      requestedKey = undefined;
      // SVG/텍스트로 폴백한다. 도메인 상태를 되돌리거나 진행하지 않는다.
    });
}
const unsubscribe = bridge.subscribe(update);
update(latest); // 최초 장면도 같은 경로로 로드한다.
// 해제 시 unsubscribe(), pending?.abort(), adapter.dispose()를 호출한다.
```

프레임 루프는 장면의 시각적 애니메이션만 담당하며 엔진의 `dispatch`를 반복 호출하지 않는다. 로딩 중 최신 명령의 클릭 중복을 막거나 로더를 폴백 모드로 전환해도 게임 비용을 임의 환불·이중 부과하지 않는다.

### Three.js

1. 로컬 패키지로 `three`를 고정하고 번들러에서 코드를 분리한다. CDN의 가용성을 전제로 두지 않는다. GLTFLoader는 매니페스트의 허용 에셋만 로드한다.
2. WebGLRenderer의 DOM을 `#viewport` 내부에 붙이고 기존 SVG를 백업으로 보관한다. 컨텍스트 생성·모델 로드 실패 시 SVG를 다시 표시한다.
3. Raycaster로 맞은 객체의 `userData.hotspotId`를 읽는다. 현 노드의 핫스폿 매핑에서 선택 메뉴를 열고, 실제 확정 시 `{type:'CHOOSE', choiceId}`를 한 번 보낸다. 객체 클릭 자체로 HP를 직접 바꾸지 않는다.
4. `ResizeObserver`로 SceneFrame의 content box를 측정한다. perspective면 aspect와 projection matrix를, orthographic이면 좌우 범위를 갱신한다. DPR은 `Math.min(devicePixelRatio, 1.5~2)`로 제한한다.
5. 장면 전환 시 `BufferGeometry.dispose`, material·texture dispose, RAF 취소, observer·이벤트 해제와 리소스 캐시 소유권을 관리한다. 공유 텍스처는 참조 수가 0일 때만 해제한다.
6. `webglcontextlost`에서는 애니메이션을 중단하고 HTML 선택지와 저장 상태를 유지한다. 복구 시 저장 스냅샷으로 재구성한다.

## 5. Unity WebGL 브리지

Unity는 표현·충돌·이동 연출을 담당하고 JS 엔진은 결과를 판정한다. Unity에서 HP를 따로 감소시키는 C# 로직을 복제하지 않는다. JS↔Unity 메시지는 직렬화된 명령과 렌더링 스냅샷이다.

```text
Unity Interaction
  → .jslib ExitNorthCommand(JSON)
  → window.ExitNorthBridge.dispatch({type:'CHOOSE', choiceId})
  → JS GameEngine
  → 구독자
  → unityInstance.SendMessage('GameBridge', 'ApplyState', JSON.stringify(snapshot))
```

```js
// Unity 플러그인 .jslib의 핵심 형태. 실제 Unity 빌드 통합 시 컴파일 검증 필요.
mergeInto(LibraryManager.library, {
  ExitNorthCommand: function (pointer) {
    const command = JSON.parse(UTF8ToString(pointer));
    window.ExitNorthBridge.dispatch(command);
  }
});
```

Unity가 생성된 같은 페이지에서 실행되는 구성을 기본으로 한다. iframe을 써야 하면 부모에 브리지가 자동 공유되지 않으므로 `postMessage` 어댑터와 정확한 origin·명령 형식 검증, 로딩 handshake가 필요하다. 임의 사이트에서 온 메시지로 명령을 실행하지 않는다.

Unity 상태 수신 시 새 노드로 이동하고 연출만 재생한다. 도메인 사망이 이미 결정된 상태에서 ‘물리 도착’ 콜백이 엔딩을 다시 지급해서는 안 된다. 엔진 도메인과 Unity 수명주기를 분리하고 재로딩 후 `getSnapshot()`으로 동기화한다.

## 6. 3D 이동 비용과 확률의 일관성

현재 판정 단위는 노드의 의미 있는 행동 한 번이다. 3D에서도 플레이어의 이동 명령에 **경로 구간 하나의 HP·허기 비용**을 선언하고 먼저 판정을 통과한 뒤 이동 애니메이션을 재생한다. 60fps에서 30fps보다 두 배 비용을 내거나, 무료 자유 이동으로 유료 노드 이동을 건너뛰지 않게 한다.

완전한 자유 이동을 추가할 경우 후속 스키마에 이동 구간/고정 거리 단위의 `MOVE_SEGMENT` 의도와 비용 카탈로그를 추가한다. 카메라 회전·UI 조작은 생존 행동이 아니므로 비용을 내지 않는다. 3D에서 적과 부딪치는 이벤트도 명령 큐의 데이터 사건으로 바꾸고 같은 비용·아사·HP 0 규칙을 적용한다.

서치라이트의 시각적 원뿔과 내러티브 확률을 이중으로 판정하지 않는다. 프로토타입의 확률 방식을 유지할지, 실제 가시성 샘플을 도메인 입력으로 받아 판정할지 한 모드를 정한다. 후자의 경우 seed·위치·가시성 입력을 재현 가능한 형태로 저장하고 FPS와 프레임 도착 순서에 독립적인 검증이 필요하다.

## 7. 자산·배포·성능

3D 자산은 단일 HTML에 모두 내장하기보다 버전과 해시가 있는 파일로 분리한다. 이벤트 JSON은 논리 키를 유지하고 캐시 무효화는 매니페스트 해시로 처리한다. 처음에는 현재 장면과 다음 공통 장면만 선로드한다. 모바일용 저해상도 텍스처·낮은 폴리곤·정적인 그림자와 품질 폴백을 준비한다.

Three.js 도입 시 정적 서버가 모델·텍스처·번들 파일을 명시적으로 제공하도록 `serve.mjs`를 확장해야 한다. 현재 서버는 모델까지 포함한 단일 HTML을 공개한다. Unity는 `.wasm`에 `application/wasm`, 압축 파일에는 실제 압축 방식에 맞는 `Content-Encoding`이 필요하다. 스레드 빌드가 필요하면 COOP/COEP와 SharedArrayBuffer 지원, 에셋의 CORS/CORP도 별도로 검증한다. GitHub Pages만으로 필요한 모든 헤더를 자유롭게 설정할 수 있다고 가정하지 않는다.

CSP는 외부 CDN 전체를 열지 말고 자체 출처의 script/connect/img/worker와 필요한 `blob:`·WASM 권한만 허용하도록 바꾼다. 단일 파일 인라인 코드는 빌드 해시 또는 nonce 정책으로 점진 전환할 수 있다. 실제 출처와 빌드 옵션으로 확인한 뒤 설정한다.

**전환 합격 기준:** 동일 저장+동일 명령에서 2D와 3D의 상태가 일치하고, 로드 실패·리사이즈·컨텍스트 상실 후에도 HTML로 모든 필수 선택을 진행할 수 있으며, 장면을 반복 전환해 리소스가 누수되지 않아야 한다. 현재 2D와 실제 WebGL 모델·동작·장면 전환을 Chromium에서 검증한다. Unity 빌드와 실제 하드웨어 GPU 호환성은 미실행이다.
