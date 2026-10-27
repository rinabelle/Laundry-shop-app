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
    const password = customerLoginForm.querySelector('input[type="password"]').value.trim();
      
    try{
      const response = await fetch('https://laundry-shop-app-9i58.onrender.com/api/customer/login', {
        method: 'POST',
        headers: { 'Content-Type':  'application/json'},
        body: JSON.stringify({email, password})
      });
      const data = await response.json();
      console.log("Server response:", data.error || data.message || data);

      if (response.ok) {
        localStorage.setItem('customerName', data.customer.full_name);
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
    const password = employeeLoginForm.querySelector('input[type="password"]').value.trim();

    console.log("DEBUG Employee Login Payload:", { email, password });

    try{
      const response = await fetch('https://laundry-shop-app-9i58.onrender.com/api/employee/login', {
        method: 'POST',
        headers: { 'Content-Type':  'application/json'},
        body: JSON.stringify({email, password})
      });
      const data = await response.json();
      console.log("Server response:", data.error || data.message || data);

      if(response.ok) {
        localStorage.setItem('employeeName', data.employee.full_name)
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
    const password = customerSignForm.querySelector('input[type="password"]').value.trim();

    try{
      const response = await fetch('https://laundry-shop-app-9i58.onrender.com/api/customer/signup', {
        method: 'POST',
        headers: { 'Content-Type':  'application/json'},
        body: JSON.stringify({full_name, email, password})
      });
      const data = await response.json();
      console.log("Sending to server:", { full_name, email, password });

      if (response.ok) {
        localStorage.setItem('customerName', full_name);
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
  
const sendCodeBtn = document.getElementById('sendCodeBtn');
    if (sendCodeBtn) {
      sendCodeBtn.addEventListener('click', async () => {
          userEmail = document.getElementById('reset-email').value;

          if (!userEmail) {
              alert('Please enter your email address first.');
              return;
          }

          try {
              const response = await fetch('https://laundry-shop-app-9i58.onrender.com/api/customer/forgot-password', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: userEmail })
              });

              const data = await response.json();

              if (response.ok) {
                  alert('Reset code sent to your email!');
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
              const response = await fetch('https://laundry-shop-app-9i58.onrender.com/api/verify-otp', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: userEmail, code: otpCode })
              });

              const data = await response.json();

              if (response.ok) {
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
              const response = await fetch('https://laundry-shop-app-9i58.onrender.com/api/reset-password', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: userEmail, password: newPassword })
              });

              const data = await response.json();

              if (response.ok) {
                  alert('Password updated successfully! You can now log in.');
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

  const SUPABASE_URL = 'https://mlwwwjmkogmdfvfovwib.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_w6VrT7DDLaXH29ZfwiPVoQ_JUhLrhTD';
  const API_BASE = 'https://laundry-shop-app-9i58.onrender.com';

  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  document.getElementById('google-btn')?.addEventListener('click', async () => {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        queryParams: { prompt: 'select_account' }
      }
    });
    if (error) alert(error.message);
  });

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event !== 'SIGNED_IN' || !session) return;

    setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/customer/google-login`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        const data = await response.json();

        if (response.ok) {
          localStorage.setItem('customerName', data.customer.full_name);
          window.location.href = 'Customer.html';
        } else {
          alert(data.error);
          await supabaseClient.auth.signOut();
        }
      } catch (err) {
        console.error(err);
        alert('Could not connect to the server.');
      }
    }, 0);
  });

  const googleBtn = document.getElementById('google-btn');

  function setGoogleLoading(loading) {
    if (!googleBtn) return;
    googleBtn.disabled = loading;
    googleBtn.querySelector('span').textContent =
      loading ? 'Redirecting…' : 'Continue with Google';
  }

  googleBtn?.addEventListener('click', async () => {
    setGoogleLoading(true);   

    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        queryParams: { prompt: 'select_account' }
      }
    });

    if (error) {
      alert(error.message);
      setGoogleLoading(false);  
    }
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) setGoogleLoading(false);
  });

  let handlingGoogleLogin = false;

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event !== 'SIGNED_IN' || !session || handlingGoogleLogin) return;
    handlingGoogleLogin = true;
    setGoogleLoading(true);

    setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/api/customer/google-login`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        const data = await response.json();

        if (response.ok) {
          localStorage.setItem('customerName', data.customer.full_name);
          window.location.href = 'Customer.html';
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