export interface PasswordScoreResult {
  score: 0 | 1 | 2 | 3 | 4;
  labelKey: 'passwordStrengthWeak' | 'passwordStrengthFair' | 'passwordStrengthGood' | 'passwordStrengthStrong';
  color: string;
  isValid: boolean;
  errors: string[];
}

const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  '1234567890',
  'admin12345',
  'qwertyuiop',
  'admin@123456',
  'supermarket',
  'gebeyaos123',
]);

export function calculatePasswordStrength(password: string): PasswordScoreResult {
  const errors: string[] = [];

  if (!password || password.length === 0) {
    return {
      score: 0,
      labelKey: 'passwordStrengthWeak',
      color: 'bg-red-500',
      isValid: false,
      errors: ['Password cannot be empty'],
    };
  }

  if (password.length < 10) {
    errors.push('Minimum 10 characters required');
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Password is too common and easily guessed');
  }

  let varietyCount = 0;
  if (/[a-z]/.test(password)) varietyCount++;
  if (/[A-Z]/.test(password)) varietyCount++;
  if (/[0-9]/.test(password)) varietyCount++;
  if (/[^a-zA-Z0-9]/.test(password)) varietyCount++;

  let score: 0 | 1 | 2 | 3 | 4 = 0;

  if (password.length >= 10 && !COMMON_PASSWORDS.has(password.toLowerCase())) {
    if (varietyCount >= 4 && password.length >= 14) {
      score = 4;
    } else if (varietyCount >= 3 && password.length >= 12) {
      score = 3;
    } else if (varietyCount >= 2 && password.length >= 10) {
      score = 2;
    } else {
      score = 1;
    }
  } else {
    score = password.length >= 6 ? 1 : 0;
  }

  const isValid = password.length >= 10 && !COMMON_PASSWORDS.has(password.toLowerCase()) && varietyCount >= 2;

  let labelKey: PasswordScoreResult['labelKey'] = 'passwordStrengthWeak';
  let color = 'bg-red-500';

  if (score >= 4) {
    labelKey = 'passwordStrengthStrong';
    color = 'bg-emerald-500';
  } else if (score === 3) {
    labelKey = 'passwordStrengthGood';
    color = 'bg-teal-500';
  } else if (score === 2) {
    labelKey = 'passwordStrengthFair';
    color = 'bg-amber-500';
  } else {
    labelKey = 'passwordStrengthWeak';
    color = 'bg-red-500';
  }

  return {
    score,
    labelKey,
    color,
    isValid,
    errors,
  };
}

