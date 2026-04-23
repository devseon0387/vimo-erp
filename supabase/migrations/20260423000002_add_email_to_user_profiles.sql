-- user_profiles 테이블에 email 컬럼 추가
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 기존 계정의 email을 auth.users에서 채우기
UPDATE user_profiles
SET email = au.email
FROM auth.users au
WHERE user_profiles.id = au.id
  AND user_profiles.email IS NULL;
