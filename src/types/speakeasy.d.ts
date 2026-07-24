declare module "speakeasy" {
  interface GeneratedSecret {
    ascii: string;
    hex: string;
    base32: string;
    otpauth_url: string;
  }
  interface GenerateSecretOptions {
    name?: string;
    issuer?: string;
    length?: number;
  }
  interface TotpVerifyOptions {
    secret: string;
    encoding?: string;
    token: string;
    window?: number;
  }
  const totp: {
    verify(options: TotpVerifyOptions): boolean;
  };
  function generateSecret(options?: GenerateSecretOptions): GeneratedSecret;
}
