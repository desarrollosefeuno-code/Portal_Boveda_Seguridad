import React from 'react';
import { Modal } from './Modal';
import { Button, type ButtonVariant } from './Button';
import { Alert } from './Alert';

export type ConfirmAction = { label: string; onClick: () => void; tone?: 'primary' | 'danger' | 'neutral'; loading?: boolean };

const VARIANT: Record<NonNullable<ConfirmAction['tone']>, ButtonVariant> = { primary: 'primary', danger: 'danger', neutral: 'secondary' };

/**
 * Confirmación con acciones explícitas (D9; reemplaza window.confirm). La primera acción es la recomendada y va a la derecha.
 * El botón dice el verbo y el objeto ("Eliminar solicitud"), nunca "Aceptar".
 */
export const ConfirmDialog: React.FC<{ open: boolean; title: string; message: React.ReactNode; actions: ConfirmAction[]; onClose: () => void; warning?: string }> =
    ({ open, title, message, actions, onClose, warning }) => (
        <Modal open={open} onClose={onClose} title={title} size="sm"
            footer={[...actions].reverse().map(action => (
                <Button key={action.label} variant={VARIANT[action.tone ?? 'neutral']} loading={action.loading} onClick={action.onClick}>{action.label}</Button>
            ))}>
            <div className="grid gap-3.5">
                <div className="text-fg-2">{message}</div>
                {warning && <Alert tone="warn">{warning}</Alert>}
            </div>
        </Modal>
    );
