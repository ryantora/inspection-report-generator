export const lightTheme = {
  background: '#F4F6F8',
  surface: '#FFFFFF',
  text: '#101418',
  subtext: '#5B6470',
  primary: '#1565C0',
  primaryText: '#FFFFFF',
  success: '#2E7D32',
  danger: '#C62828',
  border: '#E1E5EA',
  card: '#FFFFFF',
};

export const darkTheme = {
  background: '#0D1117',
  surface: '#161B22',
  text: '#F0F3F6',
  subtext: '#9DA7B3',
  primary: '#4C9AFF',
  primaryText: '#0D1117',
  success: '#4CAF50',
  danger: '#EF5350',
  border: '#2A313C',
  card: '#161B22',
};

export function getTheme(scheme) {
  return scheme === 'dark' ? darkTheme : lightTheme;
}
