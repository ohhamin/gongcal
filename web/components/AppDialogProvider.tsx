'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

type DialogKind = 'alert' | 'confirm';

type DialogRequest = {
    kind: DialogKind;
    message: string;
    resolve: (value: boolean) => void;
};

type DialogApi = {
    alert: (message: string) => Promise<void>;
    confirm: (message: string) => Promise<boolean>;
};

const DialogContext = createContext<DialogApi | null>(null);
const pendingRequests: DialogRequest[] = [];
let externalApi: DialogApi | null = null;

export function appAlert(message: string) {
    if (externalApi) return externalApi.alert(message);

    // Provider mount 전 호출도 브라우저 기본 alert로 떨어지지 않게 큐에 보관합니다.
    return new Promise<void>((resolve) => {
        pendingRequests.push({ kind: 'alert', message, resolve: () => resolve() });
    });
}

export function appConfirm(message: string) {
    if (externalApi) return externalApi.confirm(message);

    return new Promise<boolean>((resolve) => {
        pendingRequests.push({ kind: 'confirm', message, resolve });
    });
}

export function useAppDialog() {
    const api = useContext(DialogContext);
    if (!api) throw new Error('useAppDialog must be used within AppDialogProvider');
    return api;
}

export default function AppDialogProvider({ children }: { children: ReactNode }) {
    const [queue, setQueue] = useState<DialogRequest[]>(() => pendingRequests.splice(0));
    const request = queue[0] || null;

    const api = useMemo<DialogApi>(() => ({
        alert: (message) => new Promise<void>((resolve) => {
            setQueue((prev) => [...prev, { kind: 'alert', message, resolve: () => resolve() }]);
        }),
        confirm: (message) => new Promise<boolean>((resolve) => {
            setQueue((prev) => [...prev, { kind: 'confirm', message, resolve }]);
        }),
    }), []);

    useEffect(() => {
        externalApi = api;

        return () => {
            if (externalApi === api) externalApi = null;
        };
    }, [api]);

    const close = (value: boolean) => {
        request?.resolve(value);
        setQueue((prev) => prev.slice(1));
    };

    return (
        <DialogContext.Provider value={api}>
            {children}
            {request && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(11,15,31,0.42)] p-0 sm:items-center sm:p-4">
                    <div className="w-full max-w-sm rounded-t-[28px] bg-white p-5 shadow-[var(--oc-elevation)] sm:rounded-[28px]">
                        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--oc-divider-strong)] sm:hidden" />
                        <p className="text-lg font-extrabold tracking-[-0.03em] text-[var(--oc-text)]">
                            {request.kind === 'confirm' ? '확인해주세요' : '알림'}
                        </p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--oc-text-secondary)]">{request.message}</p>
                        <div className="mt-6 flex justify-end gap-2">
                            {request.kind === 'confirm' && (
                                <button className="rounded-xl bg-[var(--oc-surface-2)] px-4 py-2.5 text-sm font-bold text-[var(--oc-text-secondary)]" onClick={() => close(false)}>
                                    취소
                                </button>
                            )}
                            <button className="rounded-xl bg-[var(--oc-primary)] px-4 py-2.5 text-sm font-bold text-white" onClick={() => close(true)}>
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
}
