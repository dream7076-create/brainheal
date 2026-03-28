import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

const SUPABASE_URL = "https://kwoyfapyufslrbhiafki.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3b3lmYXB5dWZzbHJiaGlhZmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDk4OTMsImV4cCI6MjA4OTEyNTg5M30.DmaQVn1Zaz6CBFklq6vxreYdl1e7WJmWCryH8KphK-c";

export async function POST(req: NextRequest) {
  try {
    const { user_account, password } = await req.json();

    if (!user_account || !password) {
      return NextResponse.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
    }

    // 1. Supabase에서 user 조회 (user_account로 검색)
    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user?user_account=eq.${encodeURIComponent(user_account.trim())}&select=user_id,user_account,password,name,email,job,teacher_check`,
      {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        }
      }
    );

    const users = await userRes.json();

    if (!Array.isArray(users) || users.length === 0) {
      return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const user = users[0];

    // 2. bcrypt로 비밀번호 검증
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    // 3. Supabase instructors 테이블에서 강사 정보 조회 (이메일 기준)
    let instructorId = null;
    let instructorName = user.name || "";
    let role = "instructor";

    // teacher_check가 Y인 경우만 강사로 처리
    if (user.teacher_check === "Y") {
      const instRes = await fetch(
        `${SUPABASE_URL}/rest/v1/instructors?select=id,name,region&is_active=eq.true`,
        {
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
          }
        }
      );
      const instructors = await instRes.json();

      // 이름으로 매칭 시도
      const matched = Array.isArray(instructors)
        ? instructors.find((i: any) => i.name === user.name)
        : null;

      if (matched) {
        instructorId = matched.id;
        instructorName = (matched.region ? matched.region + " - " : "") + matched.name;
      }
    }

    // 4. 관리자 계정 확인 (user_id === 1 또는 user_account === 'jsw485')
    if (user.user_id === 1 || user.user_account === "jsw485") {
      role = "admin";
    }

    // 5. 성공 응답 — 세션 토큰 없이 user 정보만 반환
    return NextResponse.json({
      success: true,
      userId: String(user.user_id),
      role,
      instructorId,
      instructorName,
      userName: user.name,
      email: user.email,
      // Supabase Auth 토큰 없이 동작하므로 accessToken은 null
      accessToken: null,
      refreshToken: null,
    });

  } catch (e: any) {
    console.error("Login API error:", e);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
