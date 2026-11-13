import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Ban, KeyRound, Lock, Pencil, ShieldCheck, ShieldMinus, ShieldPlus, Trash2, UserPlus, Users } from 'lucide-react';
import {
  ActionMenu,
  Alert,
  Badge,
  Button,
  CheckboxGroup,
  CheckboxRow,
  ConfirmDialog,
  F1Spinner,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  useToast,
  type MenuAction,
} from './f1-ui';
import { api, errorMessage } from '../services/api';
import { ENVIRONMENTS, type AdminRequest, type Environment, type ManagedUser } from '../types/vault';
import { formatDateTime } from '../utils/secrets';
import { generatePassword } from '../utils/passwordGenerator';

const ENV_LABEL: Record<Environment, string> = { PROD: 'Producción', STAGING: 'Staging', QA: 'QA', DEV: 'Desarrollo' };
const tempPassword = () => generatePassword({ length: 16, uppercase: true, lowercase: true, numbers: true, symbols: true });

type Confirm = { title: string; message: string; label: string; tone: 'danger' | 'primary'; run: () => Promise<{ message?: string }> };

function EnvironmentPicker({ value, onChange }: { value: Environment[]; onChange: (v: Environment[]) => void }) {
  return (
    <CheckboxGroup legend="Entornos de llaves que puede ver">
      {ENVIRONMENTS.map((env) => (
        <CheckboxRow key={env} label={ENV_LABEL[env]} checked={value.includes(env)}
          onChange={(e) => onChange(e.target.checked ? [...value, env] : value.filter((x) => x !== env))} />
      ))}
    </CheckboxGroup>
  );
}

/** Muestra una contraseña temporal una sola vez, para entregarla al usuario por un canal seguro. */
function TemporaryPasswordNotice({ password }: { password: string }) {
  return (
    <Alert tone="warn" title="Contraseña temporal">
      <p>Entrégala por un canal seguro; el usuario deberá cambiarla al entrar.</p>
      <p className="mt-2 select-all break-all rounded-lg bg-surface px-3 py-2 font-mono text-fg">{password}</p>
    </Alert>
  );
}

export function UsersManagementView({ currentUserId }: { currentUserId: string }) {
  const toast = useToast();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([api.users.list(), api.users.adminRequests()]);
      setUsers(u.users);
      setRequests(r.items);
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudieron cargar los usuarios.'));
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const res = await confirm.run();
      toast.success(res.message || 'Listo.');
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (r: AdminRequest, approve: boolean) => {
    try {
      const res = approve ? await api.users.approve(r.id) : await api.users.reject(r.id);
      toast.success(res.message || 'Listo.');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const admins = users?.filter((u) => u.role === 'admin' && u.status === 'active').length ?? 0;

  const actionsFor = (u: ManagedUser): MenuAction[] => {
    const self = u.id === currentUserId;
    const list: MenuAction[] = [{ label: 'Editar', icon: Pencil, onSelect: () => setEditing(u) }];
    if (self) return list;
    list.push({
      label: 'Asignar contraseña temporal',
      icon: KeyRound,
      onSelect: () => {
        const password = tempPassword();
        setConfirm({
          title: `Resetear la contraseña de ${u.email}`,
          message: 'Se cerrarán sus sesiones y deberá entrar con una contraseña temporal que verás a continuación.',
          label: 'Resetear contraseña',
          tone: 'primary',
          run: async () => {
            const res = await api.users.resetPassword(u.id, password);
            setIssued({ email: u.email, password });
            return res;
          },
        });
      },
    });
    if (u.hasPin) {
      list.push({
        label: 'Resetear PIN',
        icon: Lock,
        onSelect: () => setConfirm({ title: `Resetear el PIN de ${u.email}`, message: 'Deberá crear un PIN nuevo con su contraseña la próxima vez que abra la bóveda.', label: 'Resetear PIN', tone: 'primary', run: () => api.users.resetPin(u.id) }),
      });
    }
    if (u.role === 'admin') {
      list.push({
        label: 'Quitar rol admin',
        icon: ShieldMinus,
        onSelect: () => setConfirm({ title: `Quitar el rol admin a ${u.email}`, message: 'Pasará a operador y se cerrarán sus sesiones.', label: 'Quitar rol', tone: 'danger', run: () => api.users.demote(u.id) }),
      });
    } else if (u.status === 'active') {
      list.push({
        label: admins <= 1 ? 'Hacer administrador' : 'Solicitar rol admin',
        icon: ShieldPlus,
        onSelect: () =>
          setConfirm({
            title: `Rol admin para ${u.email}`,
            message: admins <= 1 ? 'Eres el único administrador: el rol se otorgará directamente y quedará registrado.' : 'Se creará una solicitud que debe aprobar otro administrador.',
            label: admins <= 1 ? 'Otorgar rol' : 'Crear solicitud',
            tone: 'primary',
            run: () => api.users.requestAdmin(u.id),
          }),
      });
    }
    list.push({
      label: 'Eliminar',
      icon: Trash2,
      danger: true,
      onSelect: () => setConfirm({ title: `Eliminar a ${u.email}`, message: 'La cuenta se borra; sus eventos siguen en la bitácora. Si solo quieres quitarle el acceso, deshabilítala.', label: 'Eliminar usuario', tone: 'danger', run: () => api.users.remove(u.id) }),
    });
    return list;
  };

  return (
    <section className="grid gap-5">
      <PageHeader
        icon={Users}
        title="Usuarios y permisos"
        description="Crea cuentas con contraseña temporal, define qué entornos de llaves ve cada uno y gestiona el rol de administrador. Otorgar ese rol requiere la aprobación de otro administrador."
        stats={users ? [{ label: 'Usuarios', value: users.length }, { label: 'Administradores activos', value: admins }, { label: 'Solicitudes pendientes', value: pending.length, warn: pending.length > 0 }] : undefined}
        actions={<Button icon={UserPlus} onClick={() => setCreating(true)}>Nuevo usuario</Button>}
      />

      {issued && (
        <div className="grid gap-2">
          <TemporaryPasswordNotice password={issued.password} />
          <Button variant="secondary" className="w-fit" onClick={() => setIssued(null)}>Ya la entregué, ocultar</Button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="grid gap-3 rounded-2xl border border-warn-line bg-warn-soft p-4">
          <h3 className="font-bold text-warn">Solicitudes de rol administrador</h3>
          {pending.map((r) => {
            const mine = r.requestedBy === currentUserId;
            return (
              <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:items-center">
                <p className="flex-1 text-sm text-fg">
                  <strong>{r.targetName}</strong> ({r.targetEmail}) · pedida por {r.requestedByEmail} el {formatDateTime(r.createdAt)}
                </p>
                <div className="flex gap-2">
                  {!mine && r.targetUserId !== currentUserId && <Button size="sm" icon={ShieldCheck} onClick={() => decide(r, true)}>Aprobar</Button>}
                  <Button size="sm" variant="secondary" onClick={() => decide(r, false)}>{mine ? 'Cancelar' : 'Rechazar'}</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!users ? (
        <div className="grid place-items-center py-16"><F1Spinner size="md" text="Cargando usuarios…" /></div>
      ) : (
        <ul className="grid gap-3">
          {users.map((u) => (
            <li key={u.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold text-fg">
                  {u.name}
                  {u.id === currentUserId && <Badge tone="brand">Tú</Badge>}
                </p>
                <p className="truncate text-sm text-fg-2">{u.email}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={u.role === 'admin' ? 'brand' : 'neutral'} icon={u.role === 'admin' ? ShieldCheck : undefined}>{u.role === 'admin' ? 'Administrador' : 'Operador'}</Badge>
                  <Badge tone={u.status === 'active' ? 'ok' : 'bad'} icon={u.status === 'active' ? undefined : Ban}>{u.status === 'active' ? 'Activo' : 'Deshabilitado'}</Badge>
                  {!u.hasPin && <Badge tone="warn">Sin PIN</Badge>}
                  {u.mustChangePassword && <Badge tone="info">Contraseña temporal</Badge>}
                  {u.locked && <Badge tone="bad" icon={Lock}>Bloqueado temporalmente</Badge>}
                  {u.role !== 'admin' && <Badge tone="neutral">Llaves: {u.keyEnvironments.map((e) => ENV_LABEL[e]).join(', ') || 'ninguna'}</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-fg-3">Último acceso: {formatDateTime(u.lastLoginAt)}</span>
                <ActionMenu label={`Acciones de ${u.email}`} actions={actionsFor(u)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateUserModal open={creating} onClose={() => setCreating(false)} onCreated={(email, password) => { setIssued({ email, password }); load(); }} />
      <EditUserModal user={editing} isSelf={editing?.id === currentUserId} onClose={() => setEditing(null)} onSaved={load} />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        actions={[
          { label: confirm?.label ?? 'Confirmar', tone: confirm?.tone ?? 'primary', onClick: runConfirm, loading: busy },
          { label: 'Cancelar', tone: 'neutral', onClick: () => setConfirm(null) },
        ]}
      />
    </section>
  );
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (email: string, password: string) => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [envs, setEnvs] = useState<Environment[]>(['DEV', 'QA']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail('');
      setName('');
      setEnvs(['DEV', 'QA']);
      setError(null);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const temporaryPassword = tempPassword();
    setBusy(true);
    setError(null);
    try {
      const res = await api.users.create({ email: email.trim(), name: name.trim(), temporaryPassword, keyEnvironments: envs });
      toast.success(res.message || 'Usuario creado.');
      onCreated(email.trim().toLowerCase(), temporaryPassword);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuevo usuario" subtitle="Se crea como operador con una contraseña temporal" icon={<UserPlus size={20} />}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="create-user" loading={busy} loadingText="Creando…">Crear usuario</Button></>}>
      <form id="create-user" onSubmit={submit} className="grid gap-4" noValidate>
        {error && <Alert tone="bad">{error}</Alert>}
        <Field label="Correo" required>{(f) => <Input {...f} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Nombre" required>{(f) => <Input {...f} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}</Field>
        <EnvironmentPicker value={envs} onChange={setEnvs} />
        <p className="text-xs text-fg-3">La contraseña temporal se genera al crear y se muestra una sola vez. Para hacerlo administrador, usa la acción "Solicitar rol admin".</p>
      </form>
    </Modal>
  );
}

function EditUserModal({ user, isSelf, onClose, onSaved }: { user: ManagedUser | null; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'active' | 'disabled'>('active');
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setStatus(user.status);
      setEnvs(user.keyEnvironments);
      setError(null);
    }
  }, [user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.users.update(user.id, { name: name.trim(), status, keyEnvironments: envs });
      toast.success(res.message || 'Usuario actualizado.');
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!user} onClose={onClose} title="Editar usuario" subtitle={user?.email} icon={<Pencil size={20} />}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="edit-user" loading={busy} loadingText="Guardando…">Guardar</Button></>}>
      <form id="edit-user" onSubmit={submit} className="grid gap-4" noValidate>
        {error && <Alert tone="bad">{error}</Alert>}
        <Field label="Nombre" required>{(f) => <Input {...f} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Estado" help={isSelf ? 'No puedes cambiar el estado de tu propia cuenta.' : 'Deshabilitar cierra sus sesiones de inmediato.'}>
          {(f) => (
            <Select {...f} value={status} disabled={isSelf} onChange={(e) => setStatus(e.target.value as 'active' | 'disabled')}>
              <option value="active">Activo</option>
              <option value="disabled">Deshabilitado</option>
            </Select>
          )}
        </Field>
        {user?.role !== 'admin' ? <EnvironmentPicker value={envs} onChange={setEnvs} /> : <p className="text-sm text-fg-2">Los administradores ven las llaves de todos los entornos.</p>}
      </form>
    </Modal>
  );
}
