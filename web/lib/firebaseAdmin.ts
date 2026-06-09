import { JWT } from 'google-auth-library';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

type PushNotification = {
    id: string | number;
    profile_id: string;
    type: string;
    title: string;
    message: string;
    related_id: number | null;
};

type PushTokenRow = {
    token: string;
};

type SendFcmOptions = {
    path?: string;
    data?: Record<string, string>;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getFirebaseCredentials() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
        throw new Error('Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.');
    }

    return { projectId, clientEmail, privateKey };
}

async function getFirebaseAccessToken() {
    const now = Date.now();
    if (cachedAccessToken && cachedAccessToken.expiresAt - 60_000 > now) {
        return cachedAccessToken.token;
    }

    const { clientEmail, privateKey } = getFirebaseCredentials();
    const jwt = new JWT({
        email: clientEmail,
        key: privateKey,
        scopes: [FCM_SCOPE],
    });

    const credentials = await jwt.authorize();
    if (!credentials.access_token) {
        throw new Error('Firebase access token was empty.');
    }

    cachedAccessToken = {
        token: credentials.access_token,
        expiresAt: credentials.expiry_date ?? now + 50 * 60 * 1000,
    };

    return cachedAccessToken.token;
}

export async function sendFcmToTokens(notification: PushNotification, tokens: PushTokenRow[], options: SendFcmOptions = {}) {
    if (tokens.length === 0) return { successCount: 0, failureCount: 0 };

    const { projectId } = getFirebaseCredentials();
    const accessToken = await getFirebaseAccessToken();
    const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    let successCount = 0;
    let failureCount = 0;

    await Promise.all(
        tokens.map(async ({ token }) => {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: {
                        token,
                        notification: {
                            title: notification.title,
                            body: notification.message,
                        },
                        data: {
                            notificationId: String(notification.id),
                            type: notification.type,
                            relatedId: notification.related_id ? String(notification.related_id) : '',
                            path: options.path ?? '/notifications',
                            click_action: 'FLUTTER_NOTIFICATION_CLICK',
                            ...(options.data ?? {}),
                        },
                        android: {
                            notification: {
                                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                            },
                        },
                        apns: {
                            payload: {
                                aps: {
                                    category: 'OPEN_NOTIFICATIONS',
                                },
                            },
                        },
                    },
                }),
            });

            if (response.ok) {
                successCount += 1;
                return;
            }

            failureCount += 1;
            console.error('FCM send failed', response.status, await response.text());
        }),
    );

    return { successCount, failureCount };
}
