import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }

  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= hash('dummy-password-for-timing-safety');
    await verify(await this.dummyHash, password);
    return false;
  }
}
