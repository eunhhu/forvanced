# Forvanced

Frida 기반 GUI 트레이너/치트 빌더. 코드 작성 없이 비주얼 스크립팅과 UI 디자이너로 트레이너를 만들고, 단독 실행 파일로 빌드합니다.

## 개요

Forvanced는 두 부분으로 구성됩니다:

- **Builder** — 트레이너를 설계하는 데스크톱 IDE (비주얼 스크립트 에디터, UI 디자이너, 빌드 시스템)
- **Runtime** — 빌드된 트레이너가 사용하는 실행 엔진 (프로젝트 설정이 임베딩된 단독 앱)

```
┌─────────────────────────┐         ┌─────────────────────────┐
│   Forvanced Builder     │         │   Generated Trainer     │
│   (개발 도구)            │  ─────► │   (배포 앱)              │
│                         │ export  │                         │
│  - Visual Script Editor │         │  - Executor Engine      │
│  - UI Designer          │         │  - Target Adapter       │
│  - Build System         │         │  - Embedded Scripts     │
│  - Project Manager      │         │  - User-Designed UI     │
└─────────────────────────┘         └─────────────────────────┘
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | SolidJS 1.9, TypeScript 5.7, Vite 6, TailwindCSS 3.4 |
| Desktop | Tauri 2.2 (Rust) |
| 비동기 런타임 | Tokio 1.35 |
| Frida 바인딩 | frida-rust 0.17 (optional, worker thread) |
| 직렬화 | serde + serde_json |
| 패키지 매니저 | Bun (workspaces) + Cargo (workspace) |
| E2E 테스트 | Playwright 1.58 |

## 프로젝트 구조

```
forvanced/
├── Cargo.toml                     # Cargo workspace root
├── package.json                   # Bun workspace root
│
├── apps/
│   ├── builder/                   # Builder IDE
│   │   ├── src/                   # SolidJS frontend
│   │   │   ├── components/
│   │   │   │   ├── script/        # 비주얼 스크립트 에디터
│   │   │   │   ├── designer/      # UI 디자이너 (캔버스, 팔레트, 속성, 레이어)
│   │   │   │   ├── build/         # 빌드 패널
│   │   │   │   ├── testing/       # 스크립트 테스트
│   │   │   │   ├── project/       # 프로젝트 관리
│   │   │   │   ├── process/       # Frida 프로세스 관리
│   │   │   │   ├── layout/        # 헤더, 사이드바
│   │   │   │   └── common/        # 공유 UI 컴포넌트
│   │   │   └── stores/            # SolidJS 상태 관리
│   │   │       ├── script.ts      # 비주얼 스크립팅 시스템
│   │   │       ├── designer.ts    # UI 디자이너 상태
│   │   │       ├── project.ts     # 프로젝트 CRUD
│   │   │       ├── target.ts      # 디바이스/프로세스 관리
│   │   │       ├── hotkeys.ts     # 키보드 단축키
│   │   │       └── ui.ts          # 탭 내비게이션
│   │   └── src-tauri/             # Rust 백엔드
│   │       └── src/
│   │           ├── lib.rs         # Tauri 앱 초기화
│   │           ├── state.rs       # AppState, ExecutorState
│   │           └── commands/      # IPC 커맨드 (디바이스, 프로세스, 프로젝트, 빌드, 실행)
│   │
│   └── runtime/                   # 단독 트레이너 템플릿
│       ├── src/                   # 최소 UI
│       └── src-tauri/             # 런타임 백엔드
│
└── crates/
    ├── forvanced-core/            # 데이터 모델 (Project, UIComponent, VisualScript)
    ├── forvanced-executor/        # 비주얼 스크립트 실행 엔진
    ├── forvanced-frida/           # Frida 통합 (real/mock 모드)
    └── forvanced-build/           # 빌드 시스템 (코드 생성, 템플릿 처리)
```

## 핵심 기능

### 비주얼 스크립트 에디터

노드 기반 비주얼 프로그래밍으로 Frida 스크립트를 작성합니다. 코드 작성 없이 메모리 조작, 함수 후킹, 네이티브 호출 등이 가능합니다.

**지원 노드 카테고리:**

| 카테고리 | 노드 예시 |
|----------|----------|
| Events | `event_ui`, `event_attach`, `event_hotkey`, `event_interval`, `event_hook` |
| Flow Control | `if`, `switch`, `for_each`, `for_range`, `loop`, `delay` |
| Memory | `memory_scan`, `memory_read`, `memory_write`, `memory_freeze`, `memory_alloc` |
| Pointers | `pointer_add`, `pointer_read`, `pointer_write` |
| Modules | `get_module`, `find_symbol`, `get_base_address`, `enumerate_exports` |
| Native/Hooks | `call_native`, `interceptor_attach`, `interceptor_replace`, `read_arg`, `replace_retval` |
| UI Binding | `ui_get_value`, `ui_set_value`, `ui_get_props` |
| Variables | `declare_variable`, `set_variable`, `get_variable` |
| Math/Logic | `math`, `compare`, `logic` |
| Strings | `string_format`, `string_concat`, `to_string`, `parse_int` |
| Arrays | `array_create`, `array_get`, `array_push`, `array_find`, `array_length` |
| Objects | `object_get`, `object_set`, `object_keys` |
| Device | `device_enumerate`, `process_attach`, `process_spawn` |
| Functions | `function_define`, `function_call`, `function_return` |
| Output | `log`, `notify` |

**에디터 기능:**
- SVG 기반 노드 캔버스 (드래그, 줌, 패닝)
- 포트 타입별 색상 구분 (flow=파랑, string=초록, pointer=빨강, int=주황)
- Node Commander (Cmd+/ 퍼지 검색으로 빠른 노드 생성)
- 우클릭 컨텍스트 메뉴
- 미니맵
- 코멘트 노드
- Host/Target 노드 시각적 구분

### 하이브리드 실행 모델

노드는 실행 위치에 따라 두 종류로 분류됩니다:

- **Host 노드** (Rust 실행) — 이벤트, 흐름 제어, 변수, UI 조작, 디바이스 관리, 로깅
- **Target 노드** (Frida RPC) — 메모리 조작, 함수 후킹, 네이티브 호출, 모듈 검사

`forvanced-executor` 크레이트가 Host 노드를 직접 실행하고, Target 노드는 `RpcBridge`를 통해 Frida 스크립트의 RPC 메서드를 호출합니다.

### UI 디자이너

드래그 앤 드롭으로 트레이너 UI를 설계합니다.

**컴포넌트:** Button, Toggle, Slider, Label, Input, Dropdown, Group, Spacer, Stack, Page, Scroll, Divider, Card

**기능:**
- 컴포넌트 팔레트에서 드래그하여 캔버스에 배치
- 속성 패널에서 스타일/동작 편집
- 레이어 패널에서 계층 관리 및 z-index 조정
- Fill/Fixed/Hug 사이징 모드
- 부모-자식 계층 구조
- Frida 액션 바인딩 (UI 이벤트 → 스크립트 실행)

### 빌드 시스템

프로젝트를 단독 실행 파일로 빌드합니다.

**빌드 프로세스:**
1. `apps/runtime` 템플릿을 출력 디렉토리에 복사
2. 프로젝트 설정 (UI 컴포넌트, 스크립트, 캔버스 설정)을 JSON으로 임베딩
3. 독립적인 `Cargo.toml`, `lib.rs`, `commands.rs`, `state.rs`, `main.rs` 생성
4. Frontend 빌드 (`bun install` + `bun run build`)
5. Rust 백엔드 빌드 (`cargo build`)
6. 실시간 빌드 로그 스트리밍

**타겟 플랫폼:** Windows, macOS (x64/ARM64), Linux, Android, iOS

### Frida 통합

`forvanced-frida` 크레이트가 Frida 연결을 관리합니다.

- **Real 모드** (`feature="real"`) — frida-rust 바인딩으로 실제 Frida 연결. 전용 Worker Thread에서 실행 (frida-rust 타입이 Send가 아니므로)
- **Mock 모드** (`feature="mock"`, 기본값) — Frida 없이 개발 가능한 시뮬레이션 모드

**지원 기능:**
- 디바이스 열거 (로컬, USB, 리모트)
- 프로세스/앱 열거 및 attach
- 스크립트 주입 및 실행
- RPC 메서드 호출
- 스크립트 메시지 구독 (Log, Send, Error)
- Spawn 후 attach

### 타겟 어댑터 시스템

다양한 연결 조합을 지원합니다:

| Host | Target | Adapter | Frida 모드 |
|------|--------|---------|-----------|
| PC (Windows) | PC 게임 | LocalPCAdapter | local/inject |
| PC (Windows) | Android (USB) | USBAdapter | usb |
| PC (macOS) | iOS (USB) | USBAdapter | usb |
| PC | 원격 디바이스 | RemoteAdapter | remote |

## 시작하기

### 필수 조건

- [Rust](https://rustup.rs/) (stable)
- [Bun](https://bun.sh/) (v1.0+)
- Tauri 2 시스템 의존성 ([가이드](https://v2.tauri.app/start/prerequisites/))

### 설치 및 실행

```bash
# 의존성 설치
bun install

# Builder 앱 개발 모드 실행
cd apps/builder && bun tauri dev

# 또는 루트에서
bun run dev
```

### 빌드

```bash
# Rust workspace 빌드
cargo build --workspace

# Builder 앱 프로덕션 빌드
cd apps/builder && bun tauri build
```

## Crate 설명

### `forvanced-core`

프로젝트 데이터 모델 정의. `Project`, `UIComponent`, `UILayout`, `VisualScript`, `ScriptNode`, `ScriptConnection`, `FridaAction`, `ValueType` 등 핵심 타입을 포함합니다.

### `forvanced-executor`

비주얼 스크립트 실행 엔진. Host 노드를 Rust에서 직접 실행하고, Target 노드는 Frida RPC로 위임합니다. `ScriptExecutor`, `ExecutionContext`, `Value` 런타임 타입 시스템, `RpcBridge`를 포함합니다.

### `forvanced-frida`

Frida 연결 관리. Worker Thread 아키텍처로 frida-rust의 thread-safety 제약을 처리합니다. mpsc 채널 기반 커맨드 패턴으로 통신합니다.

### `forvanced-build`

빌드 시스템. Runtime 템플릿 기반으로 독립 실행 가능한 트레이너를 생성합니다. 코드 생성, 설정 임베딩, 멀티 플랫폼 빌드를 담당합니다.

## 아키텍처 결정

| 결정 | 이유 |
|------|------|
| Hybrid Host/Target 실행 | 로컬 UI 제어와 원격 메모리 조작을 분리하여 성능과 안전성 확보 |
| Frida Worker Thread | frida-rust 타입이 Send 미구현이므로 전용 스레드에서 mpsc 채널로 통신 |
| Mock Frida 기본값 | Frida 미설치 환경에서도 전체 UI/로직 개발 가능 |
| SolidJS | 복잡한 에디터에서 fine-grained reactivity로 불필요한 리렌더링 방지 |
| Runtime 템플릿 기반 빌드 | apps/runtime을 복사 후 설정 임베딩하여 빠른 standalone 생성 |
| 노드 타입 스키마 시스템 | 포트 타입 정보로 IDE 기능 (타입 체크, 색상 구분, 자동완성) 지원 |

## 라이선스

MIT
