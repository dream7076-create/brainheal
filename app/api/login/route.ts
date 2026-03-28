import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

const SUPABASE_URL = "https://kwoyfapyufslrbhiafki.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3b3lmYXB5dWZzbHJiaGlhZmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDk4OTMsImV4cCI6MjA4OTEyNTg5M30.DmaQVn1Zaz6CBFklq6vxreYdl1e7WJmWCryH8KphK-c";

// 관리자 계정 목록 (user_account 기준)
const ADMIN_ACCOUNTS = ["admin"];

export async function POST(req: NextRequest) {
  try {
    const { user_account, password } = await req.json();

    if (!user_account || !password) {
      return NextResponse.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
    }

    // 1. Supabase user 테이블에서 user_account로 조회
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

    // 2. bcrypt 비밀번호 검증
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    // 3. 관리자 여부 판별 (admin 계정만)
    const isAdmin = ADMIN_ACCOUNTS.includes(user.user_account);
    const role = isAdmin ? "admin" : "instructor";

    // 4. 강사 정보 조회 (관리자도 강사 뷰 전환 시 필요할 수 있으니 시도)
    let instructorId = null;
    let instructorName = user.name || "";

    try {
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

      if (Array.isArray(instructors)) {
        // 이름 완전 일치 먼저 시도
        let matched = instructors.find((i: any) => i.name === user.name);

        // 이름 완전 일치 실패 시 포함 검색 시도
        if (!matched) {
          matched = instructors.find((i: any) =>
            i.name && user.name && i.name.includes(user.name)
          );
        }

        if (matched) {
          instructorId = matched.id;
          instructorName = (matched.region ? matched.region + " - " : "") + matched.name;
        }
      }
    } catch (e) {
      console.warn("instructors 조회 실패:", e);
    }

    // 5. 성공 응답
    return NextResponse.json({
      success: true,
      userId: String(user.user_id),
      role,
      instructorId,
      instructorName,
      userName: user.name,
      email: user.email,
      accessToken: null,
      refreshToken: null,
    });

  } catch (e: any) {
    console.error("Login API error:", e);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
