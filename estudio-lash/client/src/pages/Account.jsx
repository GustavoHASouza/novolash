import { useEffect, useState } from 'react';
import { api, useStudio } from '../api.js';
import ImageCropModal from '../components/ImageCropModal.jsx';

function getInitials(name) {
  const parts = String(name || 'NL').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || 'NL').toUpperCase();
}

export default function Account({ onBack }) {
  const { studioName, avatarUrl, setStudioSettings } = useStudio();
  const [name, setName] = useState(studioName);
  const [avatar, setAvatar] = useState(avatarUrl);
  const [email, setEmail] = useState('');
  const [cropSrc, setCropSrc] = useState(null);
  const [profileMsg, setProfileMsg] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [pwdMsg, setPwdMsg] = useState(null);
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    api
      .admin('/settings')
      .then((s) => {
        if (s?.studio_name) setName(s.studio_name);
        if (typeof s?.avatar_url === 'string') setAvatar(s.avatar_url);
        if (s?.email) setEmail(s.email);
      })
      .catch(() => {});
  }, []);

  function handleSelectFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCropSrc(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function saveProfile(e) {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      const updated = await api.admin('/settings', {
        method: 'PUT',
        body: { studio_name: name, avatar_url: avatar },
      });
      setStudioSettings({
        studioName: updated.studio_name,
        avatarUrl: updated.avatar_url,
      });
      setProfileMsg({ ok: 'Dados do estúdio atualizados em todo o aplicativo.' });
    } catch (err) {
      setProfileMsg({ err: err.message });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwdMsg(null);
    if (pwd.next !== pwd.confirm) {
      setPwdMsg({ err: 'A confirmação da nova senha não confere.' });
      return;
    }
    if (pwd.next.length < 8) {
      setPwdMsg({ err: 'A nova senha deve ter no mínimo 8 caracteres.' });
      return;
    }
    setSavingPwd(true);
    try {
      await api.admin('/password', {
        method: 'PUT',
        body: { current: pwd.current, next: pwd.next },
      });
      setPwd({ current: '', next: '', confirm: '' });
      setPwdMsg({ ok: 'Senha alterada com sucesso.' });
    } catch (err) {
      setPwdMsg({ err: err.message });
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="step-screen">
      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          aspect={1}
          outputWidth={400}
          circle={true}
          title="Ajustar foto da conta"
          onCancel={() => setCropSrc(null)}
          onConfirm={(croppedDataUrl) => {
            setAvatar(croppedDataUrl);
            setCropSrc(null);
          }}
        />
      )}

      <div className="step-nav-top">
        <button type="button" className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 10H5M9 14l-4-4 4-4" />
          </svg>
          Voltar para o painel
        </button>
      </div>

      <div className="account-grid">
        <form className="card" onSubmit={saveProfile}>
          <h2>Perfil do Estúdio</h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            Personalize a foto de perfil e o nome do estúdio exibido em todas as telas do aplicativo.
          </p>

          {profileMsg?.ok && <div className="msg ok">{profileMsg.ok}</div>}
          {profileMsg?.err && <div className="msg err">{profileMsg.err}</div>}

          <div className="account-avatar-section">
            <div className="account-avatar-preview">
              {avatar ? (
                <img src={avatar} alt={name} />
              ) : (
                <span className="account-avatar-initials">{getInitials(name)}</span>
              )}
            </div>
            <div className="account-avatar-actions">
              <label className="upload-photo-btn" style={{ display: 'inline-block', width: 'auto', padding: '9px 16px' }}>
                Alterar foto da conta
                <input type="file" accept="image/*" onChange={handleSelectFile} style={{ display: 'none' }} />
              </label>
              {avatar && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => setCropSrc(avatar)}
                  >
                    Reajustar foto
                  </button>
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => setAvatar('')}
                  >
                    Remover foto
                  </button>
                </div>
              )}
              <span className="muted" style={{ fontSize: '0.78rem', display: 'block', marginTop: 6 }}>
                A imagem aparece em miniatura no canto superior esquerdo.
              </span>
            </div>
          </div>

          <label>
            Nome do Estúdio
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Novolash Studio"
            />
          </label>

          {email && (
            <label>
              E-mail de acesso
              <input value={email} disabled style={{ opacity: 0.7 }} />
            </label>
          )}

          <button type="submit" disabled={savingProfile}>
            {savingProfile ? 'Salvando...' : 'Salvar dados do estúdio'}
          </button>
        </form>

        <form className="card" onSubmit={savePassword}>
          <h2>Alterar Senha</h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            Atualize sua senha de acesso ao painel da profissional.
          </p>

          {pwdMsg?.ok && <div className="msg ok">{pwdMsg.ok}</div>}
          {pwdMsg?.err && <div className="msg err">{pwdMsg.err}</div>}

          <label>
            Senha atual
            <input
              type="password"
              required
              placeholder="Digite sua senha atual"
              value={pwd.current}
              onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
            />
          </label>

          <label>
            Nova senha (mínimo 8 caracteres)
            <input
              type="password"
              required
              minLength={8}
              placeholder="Digite a nova senha"
              value={pwd.next}
              onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
            />
          </label>

          <label>
            Confirmar nova senha
            <input
              type="password"
              required
              minLength={8}
              placeholder="Repita a nova senha"
              value={pwd.confirm}
              onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
            />
          </label>

          <button type="submit" disabled={savingPwd}>
            {savingPwd ? 'Atualizando...' : 'Atualizar senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
