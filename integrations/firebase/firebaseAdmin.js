import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let services;

export const getFirebaseAdmin = () => {
  if (services) return services;

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId && !rawServiceAccount && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return null;
  }

  let credential = applicationDefault();
  if (rawServiceAccount) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(rawServiceAccount);
    } catch (error) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT must contain valid JSON: ${error.message}`);
    }
    credential = cert(serviceAccount);
  }

  const existingApp = getApps().find((candidate) =>
    !projectId || candidate.options.projectId === projectId
  );
  const app = existingApp || initializeApp({
    credential,
    ...(projectId ? { projectId } : {}),
  });

  services = {
    auth: getAuth(app),
    firestore: getFirestore(app),
  };
  return services;
};
