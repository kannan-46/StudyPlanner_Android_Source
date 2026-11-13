import type { Http } from '../../../shared/api/http';
import { makeTopicsApi } from '../api';
import { makeRevisionsApi } from '../../revisions/api';

function fakeHttp(): jest.Mocked<Http> {
  return {
    get: jest.fn().mockResolvedValue([]),
    post: jest.fn().mockResolvedValue({}),
    patch: jest.fn().mockResolvedValue({}),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

describe('feature apis', () => {
  it('topicsApi.list sends the query as GET /v1/topics?subjectId=s', async () => {
    const http = fakeHttp();
    await makeTopicsApi(http).list({ subjectId: 's' });
    expect(http.get).toHaveBeenCalledWith('/v1/topics', { subjectId: 's' });
  });

  it('revisionsApi.snooze posts today and days', async () => {
    const http = fakeHttp();
    await makeRevisionsApi(http).snooze('t', 'r', '2026-11-20', 1);
    expect(http.post).toHaveBeenCalledWith('/v1/topics/t/revisions/r/snooze', {
      today: '2026-11-20',
      days: 1,
    });
  });
});
