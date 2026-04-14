import { API_BASE_URL } from "./axios";

export type AuthUser = {
  _id: string;
  userId: string;
  name: string;
  voiceCloningEnabled?: boolean;
};

export type SignInPayload = { userId: string; password: string };
export type SignUpPayload = { userId: string; email: string; password: string };
export type ForgotPasswordPayload = { email: string };
export type ResetPasswordPayload = { email: string; otp: string; newPassword: string };
export type ChangePasswordPayload = { userId: string; newPassword: string };

export type SignInResponse = {
  status: boolean;
  message: string;
  user?: AuthUser;
};

export type SignUpResponse = {
  status: boolean;
  message: string;
};

export type ForgotPasswordResponse = {
  status: boolean;
  message: string;
};

export type ResetPasswordResponse = {
  status: boolean;
  message: string;
};

export type ChangePasswordResponse = {
  status: boolean;
  message: string;
};

export async function signInApi(payload: SignInPayload): Promise<SignInResponse> {
  const { data } = await API_BASE_URL.post<SignInResponse>('auth/signin', payload);
  return data;
}

export async function signUpApi(payload: SignUpPayload): Promise<SignUpResponse> {
  const { data } = await API_BASE_URL.post<SignUpResponse>('auth/signup', payload);
  return data;
}

export async function forgotPasswordApi(payload: ForgotPasswordPayload): Promise<ForgotPasswordResponse> {
  const { data } = await API_BASE_URL.post<ForgotPasswordResponse>('auth/forgot-password', payload);
  return data;
}

export async function resetPasswordApi(payload: ResetPasswordPayload): Promise<ResetPasswordResponse> {
  const { data } = await API_BASE_URL.post<ResetPasswordResponse>('auth/reset-password', payload);
  return data;
}

export async function changePasswordApi(payload: ChangePasswordPayload): Promise<ChangePasswordResponse> {
  const { data } = await API_BASE_URL.post<ChangePasswordResponse>('auth/change-password', payload);
  return data;
}