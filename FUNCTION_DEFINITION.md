# BrainHeal LMS - 기능 정의서

## 프로젝트 개요
**BrainHeal LMS**는 실버체육 프로그램의 교구 로테이션 관리 시스템입니다. 관리자가 강사별 교구 배정 일정을 관리하고, 강사들이 자신의 일정을 확인하고 교구 인계 현황을 기록할 수 있는 웹 애플리케이션입니다.

**기술 스택**: Next.js 16, React 19, Supabase (PostgreSQL), Tailwind CSS

---

## 1. 시스템 아키텍처

### 1.1 주요 컴포넌트 구조
```
App (메인 컨테이너)
├── LoginScreen (인증)
├── AdminView (관리자 대시보드)
└── InstructorView (강사 대시보드)
```

### 1.2 데이터 흐름
- **인증**: Supabase Auth (이메일/비밀번호)
- **데이터 저장소**: Supabase PostgreSQL
- **상태 관리**: React useState/useEffect
- **로컬 캐시**: localStorage (인증 정보, 뷰 설정)

---

## 2. 주요 기능 정의

### 2.1 LoginScreen 컴포넌트
**목적**: 사용자 인증 및 회원가입

#### 기능:
1. **로그인 탭**
   - 이메일/비밀번호 입력
   - Supabase Auth API를 통한 인증
   - 사용자 역할(role) 조회: admin 또는 instructor
   - 강사 계정인 경우 강사 ID, 이름, 지역 정보 조회
   - 성공 시 accessToken, userId, role, instructorId, instructorName 반환

2. **회원가입 탭**
   - 강사명, 이메일, 비밀번호 입력
   - 비밀번호 최소 6자 검증
   - Supabase Auth API를 통한 회원가입
   - 가입 후 관리자 승인 대기 메시지 표시

#### 상태 관리:
- `tab`: 현재 활성 탭 (login/signup)
- `email`, `password`, `name`: 입력 필드
- `loading`: 요청 진행 중 상태
- `error`, `success`: 메시지 표시

#### 스타일:
- 다크 테마 (배경: #0F1117)
- 그라디언트 버튼 (보라색 계열)
- 반응형 디자인 (최대 너비 380px)

---

### 2.2 App 컴포넌트
**목적**: 애플리케이션 메인 컨테이너 및 상태 관리

#### 주요 기능:

1. **인증 관리**
   - localStorage에서 저장된 인증 정보 복원
   - 로그인/로그아웃 처리
   - Supabase accessToken 설정

2. **데이터 로딩**
   - 로그인 후 DB에서 다음 데이터 조회:
     - `instructors`: 활성 강사 목록 (id, name, region, note, sort_order)
     - `equipment`: 활성 교구 목록 (id, name, base_qty)
     - `rotation_schedule`: 2026년 로테이션 일정 (instructor_id, equipment_id, week)
     - `handover_logs`: 2026년 인계 기록 (instructor_id, equipment_id, week, sent_qty, diff_note)

3. **뷰 전환**
   - 관리자: AdminView와 InstructorView 모두 접근 가능
   - 강사: InstructorView만 접근 가능
   - 우측 상단 버튼으로 뷰 전환

4. **상태 표시**
   - DB 연결 상태 표시 (● DB 또는 ● 로컬)
   - 현재 로그인 사용자 정보 표시
   - 마지막 저장 시간 표시

#### 상태 관리:
- `authUser`: 현재 로그인 사용자 정보
- `view`: 현재 활성 뷰 (admin/instructor)
- `handoverLogs`: 인계 기록 목록
- `dbLoading`: DB 데이터 로딩 상태
- `dbInstructors`, `dbEquipment`, `dbSchedule`: DB에서 조회한 데이터

#### 주요 함수:
- `handleLogin(user)`: 로그인 처리
- `handleLogout()`: 로그아웃 처리
- `reloadSchedule()`: 로테이션 일정 재로드

---

### 2.3 AdminView 컴포넌트
**목적**: 관리자용 로테이션 일정 관리 대시보드

#### 주요 기능:

1. **로테이션 일정 관리**
   - 강사별 주차별 교구 배정 현황 표시
   - 교구 배정 수정 (현재 미구현, 백업 파일에서 복원 예정)
   - 여러 시트 관리 (현재 1개 시트만 사용)

2. **데이터 저장**
   - 변경된 로테이션 일정을 Supabase `rotation_schedule` 테이블에 저장
   - 배치 처리 (50개씩 나누어 저장)
   - 저장 완료 시간 표시

3. **상태 표시**
   - 강사 수, 교구 수 표시
   - 저장 상태 표시 (저장됨/미저장)
   - 로딩 상태 표시

#### 상태 관리:
- `sheets`: 로테이션 시트 목록
- `activeSheetId`: 현재 활성 시트
- `toast`: 알림 메시지
- `saving`: 저장 진행 중 상태
- `savedAt`: 마지막 저장 시간
- `hasUnsaved`: 미저장 변경사항 여부

#### 주요 함수:
- `saveAllToDb()`: 로테이션 일정을 DB에 저장
- `showToast(msg, type)`: 알림 메시지 표시

#### 스타일:
- 다크 테마 (배경: #0F1117)
- 카드 기반 레이아웃
- 그라디언트 저장 버튼

---

### 2.4 InstructorView 컴포넌트
**목적**: 강사용 일정 확인 및 인계 관리 대시보드

#### 주요 기능:

1. **일정 탭 (Schedule)**
   - 현재 주차 교구 표시
   - 다음 인계 예정 교구 표시
   - 과거/현재/미래 주차 구분

2. **인계 탭 (Handover)**
   - 교구 인계 기록 입력 (미구현, 백업 파일에서 복원 예정)
   - 인계 수량, 메모 기록

3. **이력 탭 (History)**
   - 과거 인계 기록 조회 (미구현, 백업 파일에서 복원 예정)

#### 상태 관리:
- `activeTab`: 현재 활성 탭 (schedule/handover/history)

#### 주요 데이터 처리:
- 현재 강사의 로테이션 일정 필터링
- 현재 주차 계산 (CURRENT_WEEK 상수 기반)
- 과거/미래 주차 구분

#### 스타일:
- 다크 테마 (배경: #0F1117)
- 탭 기반 네비게이션
- 카드 기반 정보 표시

---

## 3. 데이터 모델

### 3.1 Supabase 테이블 구조

#### instructors 테이블
```
- id: UUID (PK)
- name: TEXT (강사명)
- region: TEXT (지역)
- note: TEXT (비고)
- sort_order: INTEGER (정렬 순서)
- is_active: BOOLEAN (활성 여부)
- user_id: UUID (FK to auth.users)
```

#### equipment 테이블
```
- id: UUID (PK)
- name: TEXT (교구명)
- base_qty: INTEGER (기본 수량)
- is_active: BOOLEAN (활성 여부)
```

#### rotation_schedule 테이블
```
- id: UUID (PK)
- sheet_id: TEXT (시트 ID, 기본값: "main")
- instructor_id: UUID (FK to instructors)
- equipment_id: UUID (FK to equipment)
- year: INTEGER (연도)
- week: TEXT (주차, 예: "1-1", "1-2")
```

#### handover_logs 테이블
```
- id: UUID (PK)
- instructor_id: UUID (FK to instructors)
- equipment_id: UUID (FK to equipment)
- year: INTEGER (연도)
- week: TEXT (주차)
- sent_qty: INTEGER (인계 수량)
- diff_note: TEXT (차이 메모)
- created_at: TIMESTAMP
```

#### user_roles 테이블
```
- user_id: UUID (FK to auth.users)
- role: TEXT (admin 또는 instructor)
```

---

## 4. 상수 및 설정

### 4.1 constants.js
- **WEEKS**: 52주 데이터 (1-1 ~ 12-4)
- **WEEK_LABELS**: 주차별 한글 레이블 (예: "1월 1주")
- **CURRENT_WEEK**: 현재 주차 (기본값: "3-2")
- **CURRENT_INSTRUCTOR_ID**: 현재 강사 ID (기본값: "id3")
- **INITIAL_INSTRUCTORS**: 더미 강사 데이터 (11명)
- **EQUIPMENT_LIST**: 교구 목록 (24개)
- **PALETTE**: 주차별 색상 팔레트 (5가지)
- **EQ_COLORS**: 교구별 색상 배열 (24가지)

### 4.2 supabaseClient.js
- **SUPABASE_URL**: Supabase 프로젝트 URL
- **SUPABASE_KEY**: Supabase 공개 API 키
- **API 함수**:
  - `sbGet(path)`: GET 요청
  - `sbPost(table, body)`: POST 요청
  - `sbPatch(table, body)`: PATCH 요청
  - `sbUpsert(table, body)`: UPSERT 요청 (중복 시 병합)
  - `sbDelete(table)`: DELETE 요청

### 4.3 colorUtils.js
- **calcWeekColors()**: 강사의 주차별 색상 인덱스 계산
- **getWeekPalette()**: 주차의 색상 팔레트 조회
- **getEqPalette()**: 교구의 색상 조회

---

## 5. 사용자 흐름

### 5.1 관리자 흐름
1. 로그인 (이메일/비밀번호)
2. 관리자 뷰 진입
3. 로테이션 일정 확인/수정
4. 저장 버튼 클릭 → DB 저장
5. 강사 뷰로 전환하여 강사 화면 미리보기 가능

### 5.2 강사 흐름
1. 회원가입 (강사명, 이메일, 비밀번호)
2. 관리자 승인 대기
3. 로그인 (이메일/비밀번호)
4. 강사 뷰 진입
5. 현재 주차 교구 확인
6. 다음 인계 예정 교구 확인
7. 인계 탭에서 인계 기록 입력 (미구현)
8. 이력 탭에서 과거 인계 기록 조회 (미구현)

---

## 6. 주요 기술 특징

### 6.1 인증 및 보안
- Supabase Auth를 통한 이메일/비밀번호 인증
- JWT 토큰 기반 API 인증
- 역할 기반 접근 제어 (RBAC)

### 6.2 데이터 관리
- Supabase PostgreSQL 데이터베이스
- 실시간 데이터 동기화 (필요시 수동 재로드)
- 배치 처리를 통한 대량 데이터 저장

### 6.3 UI/UX
- 다크 테마 디자인
- 반응형 레이아웃
- 토스트 알림 메시지
- 로딩 상태 표시

### 6.4 상태 관리
- React Hooks (useState, useEffect)
- localStorage를 통한 영속성
- Props를 통한 컴포넌트 간 데이터 전달

---

## 7. 현재 상태 및 미구현 기능

### 7.1 구현된 기능
- ✅ 로그인/회원가입
- ✅ 인증 및 역할 관리
- ✅ 강사/교구 데이터 조회
- ✅ 로테이션 일정 조회 및 저장
- ✅ 강사 대시보드 (일정 확인)

### 7.2 미구현 기능 (백업 파일에서 복원 예정)
- ❌ AdminView 전체 기능 (로테이션 일정 수정 UI)
- ❌ InstructorView 인계 탭 (인계 기록 입력)
- ❌ InstructorView 이력 탭 (과거 인계 기록 조회)
- ❌ 교구 관리 기능
- ❌ 강사 관리 기능
- ❌ 고급 필터링 및 검색

---

## 8. 파일 구조

```
project/brainheal-lms/
├── app/
│   ├── layout.tsx          # Next.js 레이아웃
│   ├── page.tsx            # 메인 페이지
│   └── globals.css         # 전역 스타일
├── components/
│   ├── App.jsx             # 메인 컨테이너
│   ├── LoginScreen.jsx     # 로그인/회원가입
│   ├── AdminView.jsx       # 관리자 대시보드
│   ├── InstructorView.jsx  # 강사 대시보드
│   └── backup/             # 백업 파일
├── lib/
│   ├── constants.js        # 상수 및 설정
│   ├── supabaseClient.js   # Supabase API
│   └── colorUtils.js       # 색상 유틸리티
├── public/                 # 정적 파일
├── package.json            # 의존성
└── tsconfig.json           # TypeScript 설정
```

---

## 9. 개발 가이드

### 9.1 로컬 개발 환경 설정
```bash
npm install
npm run dev
```

### 9.2 환경 변수
`.env.local` 파일에 다음 설정 필요:
- Supabase URL
- Supabase API Key

### 9.3 빌드 및 배포
```bash
npm run build
npm start
```

---

## 10. 향후 개선 사항

1. **기능 완성**
   - AdminView 로테이션 일정 수정 UI 구현
   - InstructorView 인계 기록 입력/조회 기능 구현

2. **사용성 개선**
   - 검색 및 필터링 기능
   - 일정 내보내기 (CSV, PDF)
   - 알림 기능 (이메일, 푸시)

3. **성능 최적화**
   - 데이터 페이지네이션
   - 캐싱 전략 개선
   - 번들 크기 최적화

4. **보안 강화**
   - 역할 기반 접근 제어 강화
   - 감사 로그 추가
   - 데이터 암호화

---

**작성일**: 2026년 3월 19일
**버전**: 0.1.0
