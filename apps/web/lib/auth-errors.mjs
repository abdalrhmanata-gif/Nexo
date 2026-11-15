// What a failed sign-in or sign-up says to the person.
//
// The form used to show the provider's own sentence:
//
//   if (result.error) return setError(result.error.message);
//
// so "Invalid login credentials" appeared in English on an Arabic page, at
// the worst moment a product has — the first minute of someone trying to get
// in. No translation audit could see it, because the text is not in this
// repository; it arrives from the provider at run time.
//
// The provider's `code` is stable where its prose is not, so the code picks
// one of our own sentences and the provider's wording is never shown. An
// unknown code gets a plain fallback rather than whatever the provider said:
// its messages are written for developers and occasionally say more about
// the account than a stranger at the form should learn.

export const AUTH_ERROR_FALLBACK = "That did not work. Check your details and try again.";

export const AUTH_ERROR_MESSAGES = Object.freeze({
  invalid_credentials: "The email or password is not correct.",
  email_not_confirmed: "Confirm your email address first. The link is in the message we sent you.",
  user_already_exists: "An account with this email already exists. Sign in instead.",
  email_exists: "An account with this email already exists. Sign in instead.",
  weak_password: "Password must be at least 8 characters.",
  email_address_invalid: "Enter a valid email address.",
  over_email_send_rate_limit: "Too many emails were requested. Wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  signup_disabled: "New accounts are not being opened right now.",
  user_banned: "This account cannot sign in. Contact support.",
});

/** Our sentence for a provider error. Never the provider's own. */
export function authErrorMessage(error) {
  const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "";
  return Object.hasOwn(AUTH_ERROR_MESSAGES, code) ? AUTH_ERROR_MESSAGES[code] : AUTH_ERROR_FALLBACK;
}

export const PASSWORD_UPDATE_FALLBACK = "We couldn't update your password. Request a new reset link and try again.";

const PASSWORD_UPDATE_MESSAGES = Object.freeze({
  same_password: "Choose a password that is different from your current one.",
  weak_password: "Password must be at least 8 characters.",
});

/**
 * What the new-password form says when saving fails. Only an expired or
 * missing session is a reason to ask for a new link; a password the provider
 * refused is not, and saying so sent people to request links they did not
 * need.
 */
export function passwordUpdateErrorMessage(error) {
  const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "";
  return Object.hasOwn(PASSWORD_UPDATE_MESSAGES, code) ? PASSWORD_UPDATE_MESSAGES[code] : PASSWORD_UPDATE_FALLBACK;
}
