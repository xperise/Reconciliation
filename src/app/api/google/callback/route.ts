try {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    return NextResponse.redirect(new URL('/settings?loi=thieu_refresh_token', req.url));
  }

  client.setCredentials(tokens);

  let email = '';
  try {
    const { data } = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
    email = data.email ?? '';
  } catch (userinfoErr) {
    console.error('[google callback] không lấy được email, vẫn lưu refresh token:', userinfoErr);
  }

  await saveRefreshToken(tokens.refresh_token, email);
  await writeAudit({
    actorId: user.id, actorEmail: user.email,
    action: 'google.connect', entity: 'app_settings', entityId: 'google_oauth',
    note: `Kết nối hộp thư ${email || '(không xác định được email)'}`,
  });

  return NextResponse.redirect(new URL('/settings?ok=da_ket_noi', req.url));
} catch (err) {
  console.error('[google callback]', err);
  return NextResponse.redirect(new URL('/settings?loi=doi_token_that_bai', req.url));
}
