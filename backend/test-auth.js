#!/usr/bin/env node

const API_BASE_URL = 'http://localhost:3103/api/v1';

async function testAuth() {
  console.log('🚀 Test d\'authentification WazeApp Backend\n');
  
  // Test 1: Health check
  console.log('1️⃣ Test de santé de l\'API...');
  try {
    const healthResponse = await fetch(`${API_BASE_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ API fonctionne:', healthData.data.status);
  } catch (error) {
    console.log('❌ API non disponible:', error.message);
    return;
  }

  // Test 2: Créer un utilisateur de test
  console.log('\n2️⃣ Création d\'un utilisateur de test...');
  const testUser = {
    firstName: 'Test',
    lastName: 'Demo',
    email: 'demo@wazeapp.local',
    password: 'TestPassword123!'
  };

  try {
    const registerResponse = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testUser),
    });

    const registerData = await registerResponse.json();
    
    if (registerResponse.ok) {
      console.log('✅ Utilisateur créé avec succès');
    } else if (registerResponse.status === 409) {
      console.log('ℹ️  Utilisateur existe déjà, continuons...');
    } else {
      console.log('❌ Erreur lors de la création:', registerData.message);
    }
  } catch (error) {
    console.log('❌ Erreur réseau lors de l\'inscription:', error.message);
  }

  // Test 3: Connexion
  console.log('\n3️⃣ Test de connexion...');
  try {
    const loginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password
      }),
    });

    const loginData = await loginResponse.json();
    
    if (loginResponse.ok && loginData.success) {
      console.log('✅ Connexion réussie!');
      console.log('🔑 Token reçu:', loginData.data.accessToken.substring(0, 20) + '...');
      
      // Test 4: Vérifier le profil avec le token
      console.log('\n4️⃣ Test du profil utilisateur...');
      const profileResponse = await fetch(`${API_BASE_URL}/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${loginData.data.accessToken}`
        }
      });
      
      const profileData = await profileResponse.json();
      
      if (profileResponse.ok) {
        console.log('✅ Profil récupéré:', profileData.data.user.email);
      } else {
        console.log('❌ Erreur profil:', profileData.message);
      }
      
    } else {
      console.log('❌ Connexion échouée:', loginData.message || 'Erreur inconnue');
      console.log('📋 Détails de la réponse:', {
        status: loginResponse.status,
        success: loginData.success,
        message: loginData.message
      });
    }
  } catch (error) {
    console.log('❌ Erreur réseau lors de la connexion:', error.message);
  }

  // Test 5: Tester les identifiants de démo du frontend
  console.log('\n5️⃣ Test avec les identifiants de démo du frontend...');
  const demoCredentials = [
    { email: 'demo@wazeapp.com', password: 'password123' },
    { email: 'testuser@example.com', password: 'password123' },
    { email: 'enterprise@example.com', password: 'password123' }
  ];

  for (const cred of demoCredentials) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cred)
      });
      
      const data = await response.json();
      console.log(`📧 ${cred.email}: ${response.ok ? '✅ OK' : '❌ ' + data.message}`);
    } catch (error) {
      console.log(`📧 ${cred.email}: ❌ Erreur réseau`);
    }
  }
}

testAuth().catch(console.error);