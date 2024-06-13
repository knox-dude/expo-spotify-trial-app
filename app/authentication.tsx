import axios from 'axios';
import { makeRedirectUri, useAuthRequest } from 'expo-auth-session';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import React, { useState, useEffect } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

// Your Spotify credentials
// const { CLIENT_ID, CLIENT_SECRET } = Constants.expoConfig?.extra || {};
const CLIENT_ID = '44cffff47a2d442a8022bebcd5602586';

// Discovery document
const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [codeChallenge, setCodeChallenge] = useState<string | undefined>(undefined);
  const [codeVerifier, setCodeVerifier] = useState<string | undefined>(undefined);

  useEffect(() => {
    // code verifier - generates high-entropy cryptographic random string of length 43-128
    function generateRandomString(length: number): string {
      const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const values = Crypto.getRandomValues(new Uint8Array(length));
      return values.reduce((acc, x) => acc + possible[x % possible.length], '');
    }
    setCodeVerifier(generateRandomString(Math.floor(Math.random() * 85 + 43)));

    // hashes the plain string we just generated
    const sha256 = async (plain: string) => {
      const encoder = new TextEncoder();
      const data = encoder.encode(plain);
      const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data);
      return digest;
    };
    // don't really know if our input is an ArrayBufferLike ?
    const base64encode = (input: ArrayBufferLike) => {
      return btoa(String.fromCharCode(...new Uint8Array(input)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      // going to use Spotify example code for now, but could change to not use btoa:
      // just need to debug to see if this is doing the same thing
      //
      // return Buffer.from(input, 'base64').toString('base64')
      //   .replace(/=/g, '')
      //   .replace(/\+/g, '-')
      //   .replace(/\//g, '_');
    };
    async function getCodeChallenge() {
      const hashed = await sha256(codeVerifier ? codeVerifier : '');
      if (!hashed) {
        throw new Error(`Invalid code challenge ${hashed}`);
      }
      const codeChallenge = base64encode(hashed);
      return codeChallenge;
    }
    getCodeChallenge().then((codeChallenge) => {
      setCodeChallenge(codeChallenge);
    });
  }, []);

  // Create the auth request
  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: CLIENT_ID,
      codeChallenge,
      scopes: ['user-read-email', 'user-top-read', 'playlist-read-private'],
      redirectUri: 'http://localhost:8081/',
      // redirectUri: makeRedirectUri({
      //   scheme: 'your-app-scheme',
      // }),
    },
    discovery
  );

  useEffect(() => {
    if (response?.type === 'success') {
      const { code } = response.params;
      getSpotifyToken(code);
    }
  }, [response]);

  const getSpotifyToken = async (code: string) => {
    const credsB64 = Buffer.from(`${CLIENT_ID}`, 'utf8').toString('base64');
    if (!codeVerifier) {
      throw new Error(`Invalid code verifier ${codeVerifier}`);
    }
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: makeRedirectUri({ scheme: 'my-expo-app' }),
        client_id: CLIENT_ID,
        codeVerifier,
      }),
      {
        headers: {
          Authorization: `Basic ${credsB64}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token } = response.data;
    setToken(access_token);
    getUserInfo(access_token);
  };

  const getUserInfo = async (accessToken: string) => {
    const response = await axios.get('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    setUserInfo(response.data);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Spotify Auth</Text>
      {userInfo ? (
        <Text style={styles.userInfo}>Welcome, {userInfo.display_name}</Text>
      ) : (
        <Button disabled={!request} title="Login with Spotify" onPress={() => promptAsync()} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  userInfo: {
    marginTop: 20,
    fontSize: 18,
  },
});
