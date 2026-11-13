import request from 'supertest';
import { createApp } from '../../../app';
import { makeTestDeps } from '../../../test/harness';

describe('public pages', () => {
  it('serves the privacy policy as html without auth', async () => {
    const res = await request(createApp(makeTestDeps())).get('/privacy');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html; charset=utf-8/);
    expect(res.text).toContain('<title>Study Planner — Privacy Policy</title>');
    expect(res.text).toContain('Delete account');
    expect(res.text).toContain('MongoDB Atlas');
    expect(res.headers['content-security-policy']).toMatch(
      /style-src[^;]*'unsafe-inline'/,
    );
  });

  it('shows a fallback contact line when CONTACT_EMAIL is unset', async () => {
    const res = await request(createApp(makeTestDeps())).get('/privacy');
    expect(res.text).toContain(
      "Contact the developer through the app's listing",
    );
  });

  it('shows and escapes the configured contact email', async () => {
    const deps = makeTestDeps();
    deps.config.contactEmail = 'help@example.com<x>';
    const res = await request(createApp(deps)).get('/privacy');
    expect(res.text).toContain('help@example.com&lt;x&gt;');
    expect(res.text).not.toContain('<x>');
  });

  it('serves the home page linking to ./privacy', async () => {
    const res = await request(createApp(makeTestDeps())).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html; charset=utf-8/);
    expect(res.text).toContain('<title>Study Planner</title>');
    expect(res.text).toContain('href="./privacy"');
  });
});
