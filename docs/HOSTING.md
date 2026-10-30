# 호스팅과 배포

## 요청한 Sites 플러그인

현재 세션의 도구·스킬을 검색했으나 Sites 게시 기능은 제공되지 않았다. 플러그인 게시 호출이나 공개 URL 생성은 수행하지 못했다. 현재 3D 게임은 Three.js와 캐릭터 모델까지 내장한 `index.html`로 준비되어 있다. Sites 게시 도구가 연결되면 이 파일을 업로드하고 실제 사이트에서 WebGL·입력·모바일·저장을 검증한다.

## 현재 클라우드 서버

현재 작업 머신에서 `npm start`로 Node 정적 서버를 실행한다. 기본 바인딩은 `0.0.0.0:3000`이며 실제 페이지와 `/healthz`를 요청해 확인한다. 생존 판정과 저장은 클라이언트에서 작동하므로 DB·API 키·추가 서비스가 필요 없다.

이 프로세스와 서버 포트는 현재 작업 머신의 수명에 종속된다. 클라우드 환경 게시/복원은 파일을 보존할 수 있지만 실행 중인 프로세스를 보존하는 공개 웹 호스팅 서비스가 아니다. 공개 도메인·TLS·외부 라우팅을 얻었다고 주장하지 않는다.

재시작:

```sh
cd /workspace/exit-north
npm ci
npm run build
npm start
# 상태 확인: 같은 머신에서 GET /healthz와 /를 요청한다.
```

검증 브라우저가 있는 이 환경에서는 `npm run check`로 전체 자동 검증을 다시 실행할 수 있다. 설치·빌드와 서버 시작은 분리되어 있다. 기본 포트가 사용 중이면 해당 프로세스를 함부로 종료하지 말고 `PORT=3001 npm start` 같은 대체 포트를 사용한다.

## GitHub Pages 배포 상태와 최초 설정

`.github/workflows/pages.yml`은 `main`의 `index.html` 변경 또는 수동 실행 시 정적 게임을 GitHub Pages에 배포하는 워크플로다. 배포 아티팩트에는 단일 HTML만 들어가고 소스·Git 메타데이터는 포함하지 않는다.

2026-10-30 확인:

- 게임 코드·모델 원본·문서를 `weodlf/exit-north`의 `main`에 push했다. 첫 구현 커밋은 `2cdbca2`다.
- 저장소는 공개이며, 현재 GitHub 연결로 저장소 조회와 push가 가능하다. `api.github.com`과 `weodlf.github.io`에 대한 네트워크 요청도 정상 도달한다.
- [최초 배포 실행](https://github.com/weodlf/exit-north/actions/runs/41022874461)은 Pages가 활성화되지 않아 `actions/configure-pages`에서 실패했다.
- Pages 생성 API를 호출했으나 **HTTP 403 / Resource not accessible by integration**으로 거부되었다. 저장소 조회의 `admin: true`가 연결 토큰의 Pages 설정 변경 권한을 보장하지는 않는다. 공식 `configure-pages`의 자동 활성화도 기본 `GITHUB_TOKEN` 이외의 권한 있는 토큰을 요구하므로 워크플로 옵션만 바꿔 해결하지 않는다.
- `https://weodlf.github.io/exit-north/`의 현재 응답은 **404**다. 아직 검증된 공개 게임 주소가 아니다.

저장소 관리자가 최초 1회 해야 할 설정:

1. [Settings → Pages](https://github.com/weodlf/exit-north/settings/pages)를 연다.
2. **Build and deployment → Source → GitHub Actions**를 선택한다.
3. [배포 워크플로](https://github.com/weodlf/exit-north/actions/workflows/pages.yml)의 **Run workflow**로 `main`을 실행한다. 현재 연결에서 아래 CLI로 실행할 수도 있다.

```sh
gh workflow run pages.yml --repo weodlf/exit-north --ref main
gh run list --repo weodlf/exit-north --workflow pages.yml --limit 3
```

성공한 실행의 실제 `deployment.outputs.page_url`과 HTTP 200을 확인하고, 해당 HTTPS 페이지에서 WebGL 캐릭터·이동 비용·E 조사·인벤토리·저장·모바일 레이아웃을 검증해야 배포 완료다. 활성화 전에 실패한 실행을 그대로 성공으로 취급하지 않는다. 비밀 토큰을 채팅에 전달할 필요는 없다.

## 다른 정적 호스트 또는 자체 서버

`index.html`만 HTTPS 정적 호스트의 문서 루트에 배치하면 된다. Node 서버를 사용할 경우 `PORT`를 플랫폼의 포트에 맞추고 reverse proxy/TLS 종료를 외부 인프라에서 제공한다. 게임 진행 저장은 브라우저 origin에 묶이므로 도메인을 바꾸면 이전 기기의 진행이 자동 이전되지 않는다.

3D 전환 후에는 GLB·WASM·압축 자산·CORS·필요한 격리 헤더를 추가해야 한다. 현재의 단일 파일 배포 설정이 대규모 Unity WebGL 빌드의 호스팅 요구사항까지 충족한다고 가정하지 않는다.
