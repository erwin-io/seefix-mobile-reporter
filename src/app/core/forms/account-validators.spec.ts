import { FormControl, FormGroup } from '@angular/forms';
import {
  emailValidator,
  matchingFields,
  normalizeOtp,
  otpValidator,
  passwordValidator,
  utf8ByteLength,
} from './account-validators';

const check = (validator: typeof passwordValidator, value: string) => validator(new FormControl(value));

describe('account validators', () => {
  it('password: 8 characters minimum, 72 UTF-8 bytes maximum (ACCT-15)', () => {
    expect(check(passwordValidator, 'short')).toEqual({ passwordTooShort: true });
    expect(check(passwordValidator, 'a'.repeat(8))).toBeNull();
    expect(check(passwordValidator, 'a'.repeat(72))).toBeNull();
    expect(check(passwordValidator, 'a'.repeat(73))).toEqual({ passwordTooLong: true });
    // 25 three-byte characters = 75 bytes although only 25 characters long.
    const multiByte = '€'.repeat(25);
    expect(utf8ByteLength(multiByte)).toBe(75);
    expect(check(passwordValidator, multiByte)).toEqual({ passwordTooLong: true });
  });

  it('email requires a dotted domain like the server', () => {
    expect(check(emailValidator, 'a@b.co')).toBeNull();
    expect(check(emailValidator, 'a@localhost')).toEqual({ email: true });
  });

  it('OTP: exactly six digits, and pasted codes are normalized', () => {
    expect(check(otpValidator, '123456')).toBeNull();
    expect(check(otpValidator, '12345')).toEqual({ otp: true });
    expect(normalizeOtp('123 456')).toBe('123456');
    expect(normalizeOtp('123-4567')).toBe('123456');
  });

  it('matchingFields flags a different confirmation', () => {
    const group = new FormGroup(
      { a: new FormControl('password1'), b: new FormControl('password2') },
      { validators: matchingFields('a', 'b') },
    );
    expect(group.hasError('mismatch')).toBe(true);
    group.controls.b.setValue('password1');
    expect(group.hasError('mismatch')).toBe(false);
  });
});
