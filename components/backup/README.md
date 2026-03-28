# 원본 코드 백업

이 폴더는 리팩토링 전 원본 코드를 보관합니다.

## 파일 설명

### equipment-rotation-original.jsx
- **생성일**: 2026-03-19
- **크기**: 약 2680줄
- **설명**: 리팩토링 전 원본 equipment-rotation.jsx 파일
- **포함 내용**:
  - Supabase 클라이언트 설정
  - 상수 및 더미 데이터
  - AdminView 컴포넌트 (전체 구현)
  - InstructorView 컴포넌트 (전체 구현)
  - LoginScreen 컴포넌트 (전체 구현)
  - App 컴포넌트 (전체 구현)
  - 색상 유틸리티 함수
  - 모든 비즈니스 로직

## 리팩토링 후 변경사항

원본 코드는 다음과 같이 분해되었습니다:

```
equipment-rotation.jsx.original (2680줄)
├── components/App.jsx (메인 앱)
├── components/AdminView.jsx (관리자 페이지)
├── components/InstructorView.jsx (강사 페이지)
├── components/LoginScreen.jsx (로그인)
├── lib/supabaseClient.js (DB 클라이언트)
├── lib/constants.js (상수)
└── lib/colorUtils.js (색상 유틸)
```

## 복원 방법

필요시 원본 코드로 복원하려면:

1. `equipment-rotation.jsx.original` 파일을 `components/` 폴더로 복사
2. 파일명을 `equipment-rotation.jsx`로 변경
3. 기존 리팩토링된 파일들 삭제

## 주의사항

- 이 폴더의 파일은 **읽기 전용**으로 취급하세요
- 원본 코드 수정이 필요한 경우, 리팩토링된 파일들을 수정하세요
- 정기적으로 백업을 유지하세요
