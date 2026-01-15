# ⏰ Time Off Request Web App

<div align="center">

[![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://script.google.com/)
[![Google Sheets](https://img.shields.io/badge/Google%20Sheets-34A853?style=for-the-badge&logo=google-sheets&logoColor=white)](https://sheets.google.com/)

**20인 미만 소규모 조직을 위한 간편한 휴가 관리 솔루션**

[🚀 빠른 시작](#-빠른-시작) • 
[📖 문서](../../wiki) • 
[🐛 버그 제보](../../issues) 

</div>

---

## ✨ 주요 기능

- 📝 **간편한 신청** - 웹 폼으로 클릭 몇 번이면 휴가 신청 완료
- 📊 **자동 기록** - Google Sheets에 자동으로 데이터 저장
- 📧 **이메일 알림** - 신청/승인 시 자동 이메일 발송
- 👥 **승인 관리** - 관리자가 쉽게 승인/반려 처리
- 📱 **모바일 지원** - 모바일 브라우저에서도 원활한 사용
- 🔒 **보안** - Google Workspace 인증 기반

---

## 🚀 빠른 시작

### 사용자 (휴가 신청)
1. 관리자로부터 받은 웹 앱 URL에 접속
2. 폼에 정보 입력
3. 제출 버튼 클릭
4. 완료!

### 관리자
1. Google Sheets 생성
2. Apps Script 연결
3. 폼 코드 작성
4. 웹 앱으로 배포

---

## 📚 문서

상세한 문서는 [Wiki](../../wiki)를 참조하세요.

- 📝 [초기 설정](../../wiki/초기-설정)
- 👤 [사용자 가이드](../../wiki/휴가-신청-방법)
- 👨‍💼 [관리자 가이드](../../wiki/초기-설정)
- 👨‍💻 [개발자 가이드](../../wiki/개발-환경-설정)

---

## 🎯 이런 분들께 추천합니다

| 🏢 스타트업 | 👥 소규모 팀 | 💰 예산 절감 |
|------------|-------------|-------------|
| 복잡한 HR 시스템 없이 간단하게 | 20인 미만 조직에 최적화 | 무료 Google Workspace 활용 |

---

## 📊 시스템 구조
```
사용자 (Browser) → 웹 앱 (Google Apps Script) → Google Sheets (Database)
                              ↓
                         Gmail (이메일 알림)
```

---

## 💻 기술 스택

- Google Apps Script
- Google Sheets
- HTML/CSS/JavaScript
- Gmail API

