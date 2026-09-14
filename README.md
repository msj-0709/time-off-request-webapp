# vacation-manager

Google Apps Script 기반 휴가 신청/승인 관리 시스템.
구글 폼으로 휴가를 신청하면, 승인자에게 메일이 발송되고 URL 클릭으로 승인/반려 처리됩니다.

## 주요 기능

- 구글 폼 제출 → 승인자에게 승인 요청 메일 자동 발송
- 승인 시: 신청자에게 승인 완료 메일 + 캘린더 이벤트 생성 + 전사 공지 메일 (BCC)
- 반려 시: 신청자에게 반려 메일 발송
- 캘린더 이벤트 삭제 감지 → 자동 취소 처리

## 파일 구조

| 파일 | 역할 |
|------|------|
| `Config.js` | 전역 상수 (`CONFIG`, `STATES`), 스프레드시트 설정 로드 (`SETTINGS`) |
| `Main.js` | 외부 진입점 — `doGet`, `onFormSubmit`, `onCalendarChange` 트리거 |
| `SheetManager.js` | 시트 읽기/쓰기 — `processNewEntries`, `approve`, `deny` |
| `EmailService.js` | 이메일 발송 — 승인요청/승인완료/반려/취소/전사공지 |
| `CalendarService.js` | 캘린더 이벤트 생성·삭제 감지 |
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
