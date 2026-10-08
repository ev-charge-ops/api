import { HttpException } from '@nestjs/common';
import { PasswordService } from '../../../auth/password.service.js';
import type { MailSender } from '../../../mail/mail-sender.js';
import type { PaymentGateway } from '../../../payments/payment-gateway.port.js';
import { PaymentGateways } from '../../../payments/payment-gateways.js';
import type { PrivacyRepository } from '../../database/privacy.repository.port.js';
import { DeleteMyAccountService } from './delete-my-account.service.js';

const NOW = new Date('2026-10-08T13:00:00.000Z');
const passwords = new PasswordService();

function setup(passwordHash: string | null = null) {
  const calls: string[] = [];
  const repository = {
    findDeletableAccount: vi.fn().mockResolvedValue({
      id: 'user-1',
      name: 'Ana',
      email: 'ana@example.com',
      passwordHash,
    }),
    findOrganizationsManagedOnlyBy: vi.fn().mockResolvedValue([]),
    deleteAccount: vi.fn(() => {
      calls.push('delete');
      return Promise.resolve({
        deletionRequest: {
          id: 'request-1',
          status: 'COMPLETED',
          reason: null,
          createdAt: NOW,
          processedAt: NOW,
        },
        stripeCustomers: { TEST: 'cus_test', LIVE: 'cus_live' },
      });
    }),
  };
  const mail = {
    send: vi.fn(() => {
      calls.push('mail');
      return Promise.resolve();
    }),
  };
  const test = { deleteCustomer: vi.fn().mockResolvedValue(undefined) };
  const live = {
    deleteCustomer: vi.fn().mockRejectedValue(new Error('Stripe is down')),
  };
  const service = new DeleteMyAccountService(
    repository as unknown as PrivacyRepository,
    passwords,
    mail as unknown as MailSender,
    new PaymentGateways({
      TEST: test as unknown as PaymentGateway,
      LIVE: live as unknown as PaymentGateway,
    }),
    { now: () => NOW },
  );
  return { service, repository, mail, test, live, calls };
}

function codeOf(error: unknown): unknown {
  expect(error).toBeInstanceOf(HttpException);
  return ((error as HttpException).getResponse() as { code: string }).code;
}

describe('DeleteMyAccountService', () => {
  it('emails the old address before anonymizing and deletes both Stripe customers', async () => {
    const { service, repository, mail, test, live, calls } = setup();

    const result = await service.execute('user-1', { confirm: 'EXCLUIR' });

    expect(result).toMatchObject({ id: 'request-1', status: 'COMPLETED' });
    expect(calls).toEqual(['mail', 'delete']);
    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@example.com',
        subject: 'Sua conta foi excluída',
      }),
    );
    expect(repository.deleteAccount).toHaveBeenCalledWith('user-1', NOW);
    expect(test.deleteCustomer).toHaveBeenCalledWith('cus_test');
    expect(live.deleteCustomer).toHaveBeenCalledWith('cus_live');
  });

  it('still deletes the account when the email fails', async () => {
    const { service, repository, mail } = setup();
    mail.send.mockRejectedValueOnce(new Error('Resend is down'));

    await service.execute('user-1', { confirm: 'EXCLUIR' });

    expect(repository.deleteAccount).toHaveBeenCalled();
  });

  it('checks the password of accounts that have one', async () => {
    const { service, repository } = setup(await passwords.hash('secret-123'));

    const missing = await service
      .execute('user-1', { confirm: 'EXCLUIR' })
      .catch((error: unknown) => error);
    expect(codeOf(missing)).toBe('INVALID_PASSWORD');
    const wrong = await service
      .execute('user-1', { confirm: 'EXCLUIR', password: 'wrong-123' })
      .catch((error: unknown) => error);
    expect(codeOf(wrong)).toBe('INVALID_PASSWORD');
    expect(repository.deleteAccount).not.toHaveBeenCalled();

    await service.execute('user-1', {
      confirm: 'EXCLUIR',
      password: 'secret-123',
    });
    expect(repository.deleteAccount).toHaveBeenCalled();
  });

  it('refuses the only manager of an organization', async () => {
    const { service, repository, mail } = setup();
    repository.findOrganizationsManagedOnlyBy.mockResolvedValue([
      'Residencial Aclimação',
    ]);

    const error = await service
      .execute('user-1', { confirm: 'EXCLUIR' })
      .catch((caught: unknown) => caught);

    expect(codeOf(error)).toBe('LAST_MANAGER');
    expect((error as HttpException).getStatus()).toBe(409);
    expect(mail.send).not.toHaveBeenCalled();
    expect(repository.deleteAccount).not.toHaveBeenCalled();
  });
});
