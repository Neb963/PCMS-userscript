// Build-time policy only. No page variable, URL or persisted setting can unlock it.
// An operator-test build authorizes testing; it does not assert live qualification.
export const BUILD_MODE = 'inspection';
export const OPERATOR_TEST = BUILD_MODE === 'operator-test';
