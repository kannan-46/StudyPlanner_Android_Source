import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { ApiError } from '../errors';
import { createQueryClient } from '../queryClient';

afterEach(() => onlineManager.setOnline(true));

describe('createQueryClient', () => {
  it('runs mutations while offline so they fail fast instead of pausing', async () => {
    onlineManager.setOnline(false);
    const qc = createQueryClient();
    const mutationFn = jest.fn(async () => {
      throw new ApiError('NETWORK', 0);
    });
    const observer = new MutationObserver(qc, { mutationFn });
    await expect(observer.mutate()).rejects.toMatchObject({ code: 'NETWORK' });
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().isPaused).toBe(false);
    qc.clear();
  });

  it('runs queries while offline so a screen shows an error, not a spinner', async () => {
    onlineManager.setOnline(false);
    const qc = createQueryClient();
    const queryFn = jest.fn(async () => {
      throw new ApiError('NETWORK', 0);
    });
    await expect(
      qc.fetchQuery({ queryKey: ['x'], queryFn, retry: false }),
    ).rejects.toMatchObject({ code: 'NETWORK' });
    expect(queryFn).toHaveBeenCalledTimes(1);
    qc.clear();
  });
});
