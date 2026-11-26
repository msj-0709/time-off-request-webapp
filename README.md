# vacation-manager

Google Apps Script 기반 휴가 신청/승인 관리 시스템.
구글 폼으로 휴가를 신청하면, 승인자에게 메일이 발송되고 URL 클릭으로 승인/반려 처리됩니다.

## 주요 기능

- 구글 폼 제출 → 승인자에게 승인 요청 메일 자동 발송
- 승인 시: 신청자에게 승인 완료 메일 + 캘린더 이벤트 생성 + 전사 공지 메일 (BCC)
- 반려 시: 신청자에게 반려 메일 발송
- 캘린더 이벤트 삭제 감지 → 자동 취소 처리

## 📱 모바일 웹앱 (구글 폼 대체)

웹앱 URL(`CONFIG.WEB_APP_URL`)을 열면 휴가 앱이 바로 뜹니다. 아이폰/안드로이드 브라우저 모두 지원하며 "홈 화면에 추가"로 앱처럼 쓸 수 있습니다.

| 탭 | 기능 |
|----|------|
| 신청 | 잔여 연차 확인, 휴가 신청 (주말·공휴일 제외 일수 자동 계산) → `휴가요청내역` 시트에 행 추가 + 승인자 메일 |
| 내 휴가 | 내 신청 내역/상태, 대기·시작 전 승인 건 취소 (캘린더 일정도 삭제) |
| 승인함 | 내가 승인자인 대기 건을 앱에서 바로 승인/반려 |
| 팀 일정 | 이번 달 이후 팀 휴가 일정 |

- 신청 데이터는 구글 폼과 **같은 컬럼 순서**로 `휴가요청내역`에 쌓이므로 `연차계산` 수식이 그대로 동작합니다.
- 기존 구글 폼이 필요하면 `?form=1` 로 접속하면 폼으로 이동합니다.
- **로그인은 구글 계정과 무관**합니다. 회사 이메일로 받은 6자리 인증코드로 로그인하고, 기기에 90일간 유지됩니다.
  휴대폰에 구글 계정이 여러 개 있거나, 홈 화면 앱(별도 브라우저 환경)이어도 "파일을 열 수 없습니다" 오류 없이 열립니다.
  (웹앱 접근 권한은 `ANYONE_ANONYMOUS`, 데이터 접근은 앱 로그인 토큰으로 보호. 세션은 스크립트 속성에 토큰 해시만 저장)
- 앱을 쓸 때마다 로그인 유효기간이 자동 연장됩니다 (자주 쓰면 로그인이 풀리지 않음).
- 로그인하면 페이지 주소에 로그인 토큰(`?t=`)이 자동으로 붙습니다. 이 상태로 "홈 화면에 추가"하면 아이콘에 로그인 정보가 저장되어,
  아이폰이 브라우저 저장소를 지워도 아이콘으로 열면 바로 로그인됩니다. 로그아웃하면 해당 토큰은 즉시 무효화됩니다.
  휴대폰 분실/주소 유출 시 앱의 "모든 기기에서 로그아웃"을 누르세요.

### `__Settings` 추가 키 (선택)

| 키 | 설명 |
|----|------|
| `APPROVER_LIST` | 승인자 드롭다운 목록 (쉼표 구분 이메일). 없으면 과거 승인자 목록 사용 |
| `LEAVE_TYPES` | 휴가 구분 목록 (기본: `연차,경조휴가,병가,공가,기타`) |
| `ADMIN_EMAILS` | 모든 신청을 승인/취소할 수 있는 관리자 이메일 |
| `ALLOWED_EMAIL_DOMAINS` | 로그인 허용 도메인 (쉼표 구분, 기본 `j2db.co.kr`) |
| `ALLOWED_EMAILS` | 도메인 외 로그인 허용 이메일 (예: 외부 승인자) |
| `SESSION_DAYS` | 로그인 유지 일수 (기본 90) |

## 🚀 자동 배포 (GitHub Actions)

`main` 브랜치에 코드가 올라오면 `.github/workflows/deploy-apps-script.yml` 이 자동으로
`clasp push` 후 **기존 웹앱 배포를 새 버전으로 갱신**합니다 (웹앱 URL 유지).
Actions 탭 → "Deploy to Google Apps Script" → "Run workflow" 로 수동 실행도 가능합니다.

### 최초 1회 설정

1. https://script.google.com/home/usersettings 에서 **Google Apps Script API 사용** 을 켭니다.
2. PC 에서 스크립트 소유자 계정으로 로그인합니다:
   ```bash
   npx @google/clasp@2.4.2 login
   ```
3. 생성된 `~/.clasprc.json` (Windows: `C:\Users\<사용자>\.clasprc.json`) 파일 내용을 전체 복사합니다.
4. GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret**
   - Name: `CLASPRC_JSON`
   - Secret: 3번에서 복사한 내용
5. (선택) 배포 ID 가 바뀌면 같은 화면의 **Variables** 탭에 `DEPLOYMENT_ID` 를 추가합니다.

> `.clasprc.json` 은 구글 계정 토큰이므로 저장소에 커밋하지 말고 Secret 으로만 넣으세요.

## 파일 구조

| 파일 | 역할 |
|------|------|
| `Config.js` | 전역 상수 (`CONFIG`, `STATES`), 스프레드시트 설정 로드 (`SETTINGS`) |
| `Main.js` | 외부 진입점 — `doGet`, `onFormSubmit`, `onCalendarChange` 트리거 |
| `SheetManager.js` | 시트 읽기/쓰기 — `processNewEntries`, `approve`, `deny` |
| `EmailService.js` | 이메일 발송 — 승인요청/승인완료/반려/취소/전사공지 |
| `CalendarService.js` | 캘린더 이벤트 생성·삭제 감지 |
| `Auth.js` | 이메일 인증코드 로그인 / 세션 토큰 |
| `Api.js` | 웹앱 화면용 서버 API (조회/신청/승인/반려/취소) |
| `Index.html` | 모바일 웹앱 화면 |
| `Pages.js` | 웹앱 응답 HTML 생성 (리다이렉트, 승인완료, 에러) |
| `Utils.js` | 공통 유틸 — UUID, 템플릿 치환, 헤더 정규화, 이메일 추출 |

## 스프레드시트 구성

| 시트 이름 | 용도 |
|-----------|------|
| `휴가요청내역` | 구글 폼 응답 데이터 + 상태 관리 |
| `Execution Log` | 실행 로그 기록 |
| `__Settings` | 이메일 템플릿 및 시스템 설정 |

### 시트에 자동 추가되는 컬럼

| 컬럼 | 설명 |
|------|------|
| `state` | 상태값 (`PENDING` / `APPROVED` / `DENIED` / `CANCELLED`) |
| `actor` | 승인/반려 처리자 이메일 |
| `identifier` | 행 고유 UUID |
| `eventId` | 생성된 캘린더 이벤트 ID |

## `__Settings` 시트 주요 키

| 키 | 설명 |
|----|------|
| `PENDING_MANAGER_EMAIL_SUBJECT` / `PENDING_MANAGER_EMAIL` | 승인 요청 메일 |
| `USER_APPROVAL_EMAIL_SUBJECT` / `USER_APPROVAL_EMAIL` | 승인 완료 메일 |
| `USER_DENIED_EMAIL_SUBJECT` / `USER_DENIED_EMAIL` | 반려 메일 |
| `ANNOUNCEMENT_EMAIL_SUBJECT` / `ANNOUNCEMENT_EMAIL` | 전사 공지 메일 |
| `ANNOUNCEMENT_EMAIL_LIST` | People/AdminDirectory API 실패 시 fallback 이메일 목록 (쉼표 구분) |
| `CREATE_CALENDAR_EVENT` | `"1"` 이면 승인 시 캘린더 이벤트 생성 |
| `WRITE_TO_GROUP_CALENDAR` | `"1"` 이면 그룹 캘린더에 기록 |
| `GROUP_CALENDAR_ID` | 그룹 캘린더 ID |
| `CALENDAR_EVENT_TITLE` / `CALENDAR_EVENT_DESCRIPTION` / `CALENDAR_EVENT_LOCATION` | 캘린더 이벤트 템플릿 |

## 이메일 템플릿 변수

`{{변수명}}` 형태로 사용. 변수명은 시트 헤더를 정규화한 값.

- 괄호 이후 제거, 콜론 제거, 공백 제거
- 예: `이메일 주소` → `{{이메일주소}}`, `휴가 시작일자` → `{{휴가시작일자}}`
- 실제 사용 가능한 변수 목록은 GAS 편집기에서 `debugRowKeys()` 함수 실행으로 확인

## 승인 흐름

```
구글 폼 제출
    → onFormSubmit 트리거
    → processNewEntries() — state 없는 행을 PENDING 처리
    → UUID 생성 + 승인/반려 URL 포함 메일을 승인자에게 발송

승인자가 승인 URL 클릭
    → doGet → approve()
    → 신청자에게 승인 완료 메일
    → 캘린더 이벤트 생성 (CREATE_CALENDAR_EVENT = "1" 설정 시)
    → 전사 공지 메일 BCC 발송 (@j2db.co.kr 전 직원)

승인자가 반려 URL 클릭
    → doGet → deny()
    → 신청자에게 반려 메일

캘린더 이벤트 삭제
    → onCalendarChange 트리거
    → 상태 CANCELLED로 변경
```

## 설정 방법

### 1. Script Properties 설정

GAS 편집기 → 프로젝트 설정 → 스크립트 속성에서 추가:

| 키 | 값 |
|----|-----|
| `SPREADSHEET_ID` | 연결할 스프레드시트 ID |

### 2. 웹앱 배포 설정

- 실행 계정: `USER_DEPLOYING`
- 액세스: `ANYONE_ANONYMOUS`

### 3. GAS 서비스 추가

GAS 편집기 → 서비스(+)에서 아래 항목 추가:
- `People API` — 전사 공지 수신자 목록 조회
- `Admin SDK Directory API` — People API 실패 시 fallback

## 개발 명령어

```bash
# 로컬 → Apps Script 배포
clasp push

# Apps Script → 로컬 동기화
clasp pull

# 실행 로그 확인
clasp logs
```

## clasp 설정

- Script ID: `1oNEjxZeIswwbIS9RYNlyT3JyNGgcjZtbBe2YJPdinr_OW86ZxwXoqp-c`
- 로컬 `.js` 파일은 GAS에 `.gs` 확장자로 업로드됩니다.
