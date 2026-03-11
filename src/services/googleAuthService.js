/**
 * Google OAuth Service using Google Sign-In (GIS)
 * Uses google.accounts.id.initialize() for reliable client-side auth
 */

class GoogleAuthService {
  constructor() {
    this.clientId = null;
    this.gisInited = false;
    this.userProfile = null; // { email, name, sub, picture }
  }

  /**
   * Initialize Google Sign-In
   */
  async initialize() {
    if (this.gisInited) return true;

    // Get client ID from environment variables
    this.clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

    if (!this.clientId) {
      console.error('❌ Google Client ID not found in environment variables');
      return false;
    }

    console.log('✅ Google Client ID found:', this.clientId.substring(0, 20) + '...');

    try {
      await this.initializeGoogleSignIn();
      this.gisInited = true;
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Google Sign-In:', error);
      return false;
    }
  }

  /**
   * Initialize Google Sign-In
   */
  async initializeGoogleSignIn() {
    return new Promise((resolve, reject) => {
      // Wait for GIS script to load
      if (!window.google?.accounts?.id) {
        const checkGis = setInterval(() => {
          if (window.google?.accounts?.id) {
            clearInterval(checkGis);
            this.setupSignIn(resolve, reject);
          }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkGis);
          reject(new Error('Google Sign-In failed to load'));
        }, 10000);
      } else {
        this.setupSignIn(resolve, reject);
      }
    });
  }

  /**
   * Set up Google Sign-In
   */
  setupSignIn(resolve, reject) {
    try {
      window.google.accounts.id.initialize({
        client_id: this.clientId,
        callback: async (response) => {
          console.log('🔄 Google Sign-In callback:', response);

          if (response.error) {
            console.error('❌ Sign-in error:', response.error);
            reject(new Error(response.error));
            return;
          }

          // Get the credential
          const credential = response.credential;
          const payload = this.parseJwt(credential);

          console.log('✅ Sign-in successful!');
          console.log('👤 User:', payload);

          this.userProfile = {
            email: payload.email,
            name: payload.name,
            sub: payload.sub,
            picture: payload.picture,
          };

          this.saveSession();
          resolve(this.userProfile);
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      console.log('✅ Google Sign-In initialized');
      resolve();
    } catch (error) {
      console.error('❌ Error setting up Google Sign-In:', error);
      reject(error);
    }
  }

  /**
   * Parse JWT token (without verification - for client-side use only)
   */
  parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('❌ Error parsing JWT:', error);
      return {};
    }
  }

  /**
   * Sign in with Google
   */
  async signIn() {
    console.log('🔐 Starting Google sign-in...');

    if (!this.gisInited) {
      await this.initialize();
    }

    // If already signed in, return the profile
    if (this.userProfile) {
      console.log('✅ Already signed in, returning cached profile');
      return this.userProfile;
    }

    // Sign in with Google using prompt (One Tap)
    return new Promise((resolve, reject) => {
      window.google.accounts.id.prompt((notification) => {
        console.log('🔄 Google Sign-In prompt notification:', notification);

        if (notification.notDisplayed() || notification.notSkipped()) {
          console.warn('⚠️ Google One Tap not displayed or skipped');
          reject(new Error('Google One Tap was not displayed'));
          return;
        }

        if (notification.getDismissedReason()) {
          const reason = notification.getDismissedReason();
          console.warn('⚠️ Google One Tap dismissed:', reason);
          if (reason === 'credential_returned') {
            // User signed in successfully
            resolve(this.userProfile);
          } else {
            reject(new Error('Sign-in was dismissed: ' + reason));
          }
          return;
        }
      });

      // Also set up a timeout in case prompt doesn't work
      setTimeout(() => {
        if (!this.userProfile) {
          reject(new Error('Google sign-in timed out'));
        }
      }, 30000);
    });
  }

  /**
   * Restore session from localStorage
   */
  restoreSession() {
    try {
      const savedProfile = localStorage.getItem('google_user_profile');

      if (savedProfile) {
        this.userProfile = JSON.parse(savedProfile);
        console.log('✅ Session restored from localStorage:', {
          email: this.userProfile.email,
          name: this.userProfile.name,
        });
      }
    } catch (error) {
      console.warn('⚠️ Error restoring session from localStorage:', error);
      localStorage.removeItem('google_user_profile');
    }
  }

  /**
   * Save session to localStorage
   */
  saveSession() {
    try {
      if (this.userProfile) {
        localStorage.setItem('google_user_profile', JSON.stringify(this.userProfile));
        console.log('✅ Session saved to localStorage');
      }
    } catch (error) {
      console.warn('⚠️ Error saving session to localStorage:', error);
    }
  }

  /**
   * Clear session from localStorage
   */
  clearSession() {
    try {
      localStorage.removeItem('google_user_profile');
      console.log('✅ Session cleared from localStorage');
    } catch (error) {
      console.warn('⚠️ Error clearing session from localStorage:', error);
    }
  }

  /**
   * Get the unique auth user ID for this Google user
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
    return !!this.userProfile;
  }

  /**
   * Sign out
   */
  async signOut() {
    console.log('🚪 Signing out...');

    try {
      // Sign out from Google
      if (window.google?.accounts?.id) {
        await window.google.accounts.id.disableAutoSelect();
      }
    } catch (error) {
      console.warn('⚠️ Error signing out from Google:', error);
    }

    this.userProfile = null;
    this.clearSession();
    console.log('✅ Signed out');
  }
}

// Export singleton instance
export const googleAuthService = new GoogleAuthService();
