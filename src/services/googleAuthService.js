/**
 * Google OAuth Service using Google Identity Services (GIS)
 * Manages client-side Google OAuth authentication
 * Based on the working implementation from WAWA LIPSYNC
 */

class GoogleAuthService {
  constructor() {
    this.clientId = null;
    this.tokenClient = null;
    this.gisInited = false;
    this.accessToken = null;
    this.userProfile = null; // { email, name, sub, picture }
  }

  /**
   * Initialize the Google Identity Services
   */
  async initialize() {
    if (this.gisInited) return true;

    // Get client ID from environment variables
    this.clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

    if (!this.clientId) {
      console.error('❌ Google Client ID not found in environment variables');
      console.error('Expected: REACT_APP_GOOGLE_CLIENT_ID');
      return false;
    }

    console.log('✅ Google Client ID found:', this.clientId.substring(0, 20) + '...');

    // Restore session from localStorage if available
    this.restoreSession();

    try {
      await this.initializeGis();
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Google Identity Services:', error);
      return false;
    }
  }

  /**
   * Restore session from localStorage
   */
  restoreSession() {
    try {
      const savedToken = localStorage.getItem('google_access_token');
      const savedProfile = localStorage.getItem('google_user_profile');

      if (savedToken && savedProfile) {
        this.accessToken = savedToken;
        this.userProfile = JSON.parse(savedProfile);
        console.log('✅ Session restored from localStorage:', {
          email: this.userProfile.email,
          name: this.userProfile.name,
        });
      }
    } catch (error) {
      console.warn('⚠️ Error restoring session from localStorage:', error);
      // Clear corrupted data
      localStorage.removeItem('google_access_token');
      localStorage.removeItem('google_user_profile');
    }
  }

  /**
   * Save session to localStorage
   */
  saveSession() {
    try {
      if (this.accessToken) {
        localStorage.setItem('google_access_token', this.accessToken);
      }
      if (this.userProfile) {
        localStorage.setItem('google_user_profile', JSON.stringify(this.userProfile));
      }
      console.log('✅ Session saved to localStorage');
    } catch (error) {
      console.warn('⚠️ Error saving session to localStorage:', error);
    }
  }

  /**
   * Clear session from localStorage
   */
  clearSession() {
    try {
      localStorage.removeItem('google_access_token');
      localStorage.removeItem('google_user_profile');
      console.log('✅ Session cleared from localStorage');
    } catch (error) {
      console.warn('⚠️ Error clearing session from localStorage:', error);
    }
  }

  /**
   * Initialize Google Identity Services token client
   */
  async initializeGis() {
    return new Promise((resolve, reject) => {
      // Wait for GIS script to load
      if (!window.google?.accounts?.oauth2) {
        const checkGis = setInterval(() => {
          if (window.google?.accounts?.oauth2) {
            clearInterval(checkGis);
            this.createTokenClient(resolve, reject);
          }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkGis);
          reject(new Error('Google Identity Services failed to load'));
        }, 10000);
      } else {
        this.createTokenClient(resolve, reject);
      }
    });
  }

  /**
   * Create the OAuth token client
   */
  createTokenClient(resolve, reject) {
    try {
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: 'openid email profile',
        callback: (response) => {
          if (response.error) {
            console.error('❌ Token callback error:', response.error);
            reject(new Error(response.error));
            return;
          }
          console.log('✅ Token received successfully');
          this.accessToken = response.access_token;
          this.fetchUserProfile().then(resolve).catch(reject);
        },
      });

      this.gisInited = true;
      console.log('✅ Google Identity Services initialized');
      resolve();
    } catch (error) {
      console.error('❌ Error creating token client:', error);
      reject(error);
    }
  }

  /**
   * Sign in with Google OAuth
   * Shows popup and requests access token
   */
  async signIn() {
    console.log('🔐 Starting Google sign-in...');

    if (!this.gisInited) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      this.tokenClient.callback = async (response) => {
        if (response.error) {
          console.error('❌ Sign-in error:', response.error);
          reject(new Error(response.error));
          return;
        }

        console.log('✅ Sign-in successful!');
        this.accessToken = response.access_token;

        try {
          await this.fetchUserProfile();
          this.saveSession(); // Save to localStorage
          resolve(this.userProfile);
        } catch (error) {
          console.error('❌ Error fetching user profile:', error);
          reject(error);
        }
      };

      // If already have token, just resolve
      if (this.accessToken && this.userProfile) {
        console.log('✅ Already signed in, returning cached profile');
        resolve(this.userProfile);
        return;
      }

      // Request access token with consent popup
      console.log('📱 Requesting access token...');
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  /**
   * Fetch user profile from Google using access token
   */
  async fetchUserProfile() {
    console.log('👤 Fetching user profile...');

    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      this.userProfile = await response.json();

      console.log('✅ User profile fetched:', {
        email: this.userProfile.email,
        name: this.userProfile.name,
        sub: this.userProfile.sub,
      });

      return this.userProfile;
    } catch (error) {
      console.error('❌ Error fetching user profile:', error);
      throw error;
    }
  }

  /**
   * Get the unique auth user ID for this Google user
   * Returns "google_{sub}" format to avoid collisions with other auth providers
   */
  getAuthUserId() {
    if (!this.userProfile?.sub) {
      console.warn('⚠️ No user profile loaded');
      return null;
    }
    return `google_${this.userProfile.sub}`;
  }

  /**
   * Check if user is signed in
   */
  isUserSignedIn() {
    return !!this.accessToken && !!this.userProfile;
  }

  /**
   * Sign out and revoke token
   */
  async signOut() {
    console.log('🚪 Signing out...');

    if (this.accessToken) {
      try {
        // Revoke the token
        window.google.accounts.oauth2.revoke(this.accessToken);
        console.log('✅ Token revoked');
      } catch (error) {
        console.warn('⚠️ Error revoking token:', error);
      }
    }

    this.accessToken = null;
    this.userProfile = null;
    this.clearSession(); // Clear from localStorage
    console.log('✅ Signed out');
  }
}

// Export singleton instance
export const googleAuthService = new GoogleAuthService();
