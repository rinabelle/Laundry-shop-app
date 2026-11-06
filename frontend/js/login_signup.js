const SESSION_KEY = 'fnk_session';
const REMEMBER_EMAIL_KEY = 'fnk_remember_email';

function saveSession(role, name, email, remember) {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify({ role, name, email }));
}
function saveCustomerToken(token, remember) {
  localStorage.removeItem('customerToken');
  sessionStorage.removeItem('customerToken');
  (remember ? localStorage : sessionStorage).setItem('customerToken', token);
}
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY)); }
  catch (e) { return null; }
}
function rememberEmail(email, remember) {
  if (remember) localStorage.setItem(REMEMBER_EMAIL_KEY, email);
  else localStorage.removeItem(REMEMBER_EMAIL_KEY);
}

async function loadShopContact() {
  try {
    const response = await fetch(window.fnkApiUrl('/api/shop/settings'));
    if (!response.ok) throw new Error('Could not load shop contact details.');
    const shop = await response.json();
    const address = document.getElementById('shopAddress');
    const addressLink = document.getElementById('shopAddressLink');
    const email = document.getElementById('shopEmail');
    const emailLink = document.getElementById('shopEmailLink');
    const phone = document.getElementById('shopPhone');
    const phoneLink = document.getElementById('shopPhoneLink');
    if (address && addressLink && shop.address) {
      address.textContent = shop.address;
      addressLink.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(shop.address);
    }
    if (email && emailLink && shop.contact_email) {
      email.textContent = shop.contact_email;
      emailLink.href = 'mailto:' + shop.contact_email;
    }
    if (phone && phoneLink && shop.contact_phone) {
      phone.textContent = shop.contact_phone;
      phoneLink.href = 'tel:' + shop.contact_phone.replace(/[^\d+]/g, '');
    }
  } catch (error) {
    console.error('Could not load shop contact details:', error);
  }
}

loadShopContact();

const existingSession = getSession();
if (existingSession && existingSession.role === 'customer' &&
    (localStorage.getItem('customerToken') || sessionStorage.getItem('customerToken'))) {
  window.location.replace('Customer.html');
}

document.addEventListener('DOMContentLoaded', () => {

  showView('customer-login-view');

  document.querySelectorAll('.switch-view, .role-tab').forEach(element => {
    element.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('data-target');
      
      if (targetId) {
        showView(targetId);
      }
    });
  });


  document.querySelectorAll('.m-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const auth = document.querySelector('.auth-section');
      if (auth) auth.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  function showView(targetId) {
    document.querySelectorAll('.form-section').forEach(section => {
      section.style.display = 'none';
      section.classList.remove('active-section');
    });

    const targetSection = document.getElementById(targetId);
    if (targetSection) {
      targetSection.style.display = 'block';
      targetSection.classList.add('active-section');
    }

    document.querySelectorAll('.role-tab').forEach(tab => {
      if (tab.getAttribute('data-target') === targetId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
  }
});

const customerLoginForm = document.getElementById('login-form');
if (customerLoginForm) {
  customerLoginForm.addEventListener('submit', async (e) =>{
    e.preventDefault();

    const email = customerLoginForm.querySelector('input[type="email"]').value.trim();
    const password = document.getElementById('login-password').value.trim();
      
    try{
      const response = await fetch(window.fnkApiUrl('/api/customer/login'), {
        method: 'POST',
        headers: { 'Content-Type':  'application/json'},
        body: JSON.stringify({email, password})
      });
      const data = await response.json();

      if (response.ok) {
        const remember = document.getElementById('login-remember').checked;
        localStorage.setItem('customerName', data.customer.full_name);
        saveCustomerToken(data.token, remember);
        saveSession('customer', data.customer.full_name, data.customer.email, remember);
        rememberEmail(email, remember);
        window.location.href = 'Customer.html';
      }else{
        alert(data.error);
      }

  } catch (err) {
      console.error('Server error:', err);
      alert('Could not connect to the server.');
    }
  });
}

const employeeLoginForm = document.getElementById('employee-login-form');
if(employeeLoginForm) {
  employeeLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = employeeLoginForm.querySelector('input[type="email"]').value.trim();
    const password = document.getElementById('password').value.trim();

    try{
      const response = await fetch(window.fnkApiUrl('/api/employee/login'), {
        method: 'POST',
        headers: { 'Content-Type':  'application/json'},
        body: JSON.stringify({email, password})
      });
      const data = await response.json();
      if(response.ok) {
        localStorage.setItem('employeeName', data.employee.full_name);
        localStorage.setItem('employeeToken', data.token)
        window.location.href = 'employee.html';
      }else{
        alert(data.error);
      }

  } catch (err) {
      console.error('Server error:', err);
      alert('Could not connect to the server.');
    }
  });
}

const customerSignForm = document.getElementById('signup-form');
if (customerSignForm) {
  customerSignForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const full_name = customerSignForm.querySelector('input[name="full_name"]').value.trim();
    const email = customerSignForm.querySelector('input[type="email"]').value.trim();
    const password = document.getElementById('signup-password').value.trim();

    try{
      const response = await fetch(window.fnkApiUrl('/api/customer/signup'), {
        method: 'POST',
        headers: { 'Content-Type':  'application/json'},
        body: JSON.stringify({full_name, email, password})
      });
      const data = await response.json();

      if (response.ok) {
        const remember = document.getElementById('signup-remember').checked;
        localStorage.setItem('customerName', full_name);
        saveCustomerToken(data.token, remember);
        saveSession('customer', full_name, email, remember);
        rememberEmail(email, remember);
        window.location.href = 'Customer.html';
      }else{
        alert(data.error);
      }
  } catch (err) {
      console.error('Server error:', err);
      alert('Could not connect to the server.');
    }
  });
}

let userEmail = '';
let userCode = '';
  
const sendCodeBtn = document.getElementById('sendCodeBtn');
    if (sendCodeBtn) {
      sendCodeBtn.addEventListener('click', async () => {
          userEmail = document.getElementById('reset-email').value;

          if (!userEmail) {
              alert('Please enter your email address first.');
              return;
          }

          try {
              const response = await fetch(window.fnkApiUrl('/api/customer/forgot-password'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: userEmail })
              });

              const data = await response.json();

              if (response.ok) {
                  alert('If that email is registered, a reset code has been sent.');
                  document.getElementById('step-email').style.display = 'none';
                  document.getElementById('step-otp').style.display = 'block';
              } else {
                  alert(data.error || 'Failed to send reset code.');
              }
          } catch (error) {
              console.error('Error:', error);
              alert('Could not connect to the server.');
          }
      });
  }

  document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();

        document.getElementById('step-otp').style.display = 'none';
        document.getElementById('step-new-password').style.display = 'none';

        document.getElementById('step-email').style.display = 'block';
    });
  });

  const otpInputs = document.querySelectorAll('.otp-input');
  otpInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
          if (e.target.value && index < otpInputs.length - 1) {
              otpInputs[index + 1].focus();
          }
      });

      input.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !input.value && index > 0) {
              otpInputs[index - 1].focus();
          }
      });
  });

  const verifyBtn = document.getElementById('verifyBtn');
  if (verifyBtn) {
      verifyBtn.addEventListener('click', async () => {
          let otpCode = '';
          otpInputs.forEach(input => otpCode += input.value);

          if (otpCode.length < 6) {
              alert('Please enter the full 6-digit code.');
              return;
          }

          try {
              const response = await fetch(window.fnkApiUrl('/api/verify-otp'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: userEmail, code: otpCode })
              });

              const data = await response.json();

              if (response.ok) {
                  userCode = otpCode;
                  alert('Code verified successfully!');
                  document.getElementById('step-otp').style.display = 'none';
                  document.getElementById('step-new-password').style.display = 'block';
              } else {
                  alert(data.error || 'Invalid or expired code.');
              }
          } catch (error) {
              console.error('Error:', error);
              alert('Could not connect to the server.');
          }
      });
  }

  const resetForm = document.getElementById('reset-form-container');
  if (resetForm) {
      resetForm.addEventListener('submit', async (e) => {
          e.preventDefault();

          const newPassword = document.getElementById('reset-password').value;
          const confirmPassword = document.getElementById('confirm-password').value;

          if (!newPassword || !confirmPassword) {
              alert('Please fill out both password fields.');
              return;
          }

          if (newPassword !== confirmPassword) {
              alert('Passwords do not match!');
              return;
          }

          try {
              const response = await fetch(window.fnkApiUrl('/api/reset-password'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: userEmail, code: userCode, password: newPassword })
              });

              const data = await response.json();

              if (response.ok) {
                  try {
                      const loginRes = await fetch(window.fnkApiUrl('/api/customer/login'), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email: userEmail, password: newPassword })
                      });
                      const loginData = await loginRes.json();

                      if (loginRes.ok) {
                          localStorage.setItem('customerName', loginData.customer.full_name);
                          saveCustomerToken(loginData.token, false);
                          saveSession('customer', loginData.customer.full_name, loginData.customer.email, false);
                          window.location.href = 'Customer.html';
                          return;
                      }
                  } catch (err) {
                      console.error('Auto log-in after reset failed:', err);
                  }

                  alert('Password updated successfully! Please log in.');
                  window.location.reload();
              } else {
                  alert(data.error || 'Failed to update password.');
              }
          } catch (error) {
              console.error('Error:', error);
              alert('Could not connect to the server.');
          }
      });
  }


(function () {
  const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
  const emailInput = document.getElementById('login-email');
  const rememberBox = document.getElementById('login-remember');
  if (saved && emailInput && rememberBox) {
    emailInput.value = saved;
    rememberBox.checked = true;
  }
})();

const EYE_ICONS =
  '<svg class="eye-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
  '<svg class="eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

document.querySelectorAll('input[type="password"]').forEach(input => {
  const wrap = document.createElement('div');
  wrap.className = 'pw-field';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pw-toggle';
  btn.setAttribute('aria-label', 'Show password');
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = EYE_ICONS;

  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  wrap.appendChild(btn);
});

  const SUPABASE_URL = 'https://mlwwwjmkogmdfvfovwib.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_w6VrT7DDLaXH29ZfwiPVoQ_JUhLrhTD';
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const googleButtons = document.querySelectorAll('.google-btn');

  function setGoogleLoading(loading) {
    googleButtons.forEach(btn => {
      btn.disabled = loading;
      btn.querySelector('span').textContent = loading ? 'Redirecting…' : btn.dataset.label;
    });
  }

  googleButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      setGoogleLoading(true);

      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: new URL('index.html', window.location.href).toString(),
          queryParams: { prompt: 'select_account' }
        }
      });

      if (error) {
        alert(error.message);
        setGoogleLoading(false);
      }
    });
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) setGoogleLoading(false);
  });

  let handlingGoogleLogin = false;

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (!['SIGNED_IN', 'INITIAL_SESSION'].includes(event) || !session || handlingGoogleLogin ||
        session.user.app_metadata.provider !== 'google') return;
    handlingGoogleLogin = true;
    setGoogleLoading(true);

    setTimeout(async () => {
      try {
        const response = await fetch(window.fnkApiUrl('/api/customer/google-login'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        const data = await response.json();

        if (response.ok) {
          localStorage.setItem('customerName', data.customer.full_name);
          saveCustomerToken(data.token, true);
          saveSession('customer', data.customer.full_name, data.customer.email, true);
          window.location.replace('Customer.html');
        } else {
          alert(data.error);
          await supabaseClient.auth.signOut();
          handlingGoogleLogin = false;
          setGoogleLoading(false);
        }
      } catch (err) {
        console.error(err);
        alert('Could not connect to the server.');
        handlingGoogleLogin = false;
        setGoogleLoading(false);
      }
    }, 0);
  });