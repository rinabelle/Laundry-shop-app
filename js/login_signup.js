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
      const response = await fetch('http://localhost:3000/api/customer/login', {
        method: 'POST',
        headers: { 'Content-Type':  'application/json'},
        body: JSON.stringify({email, password})
      });
      const data = await response.json();
      console.log("Server response:", data.error || data.message || data);

      if (response.ok) {
        localStorage.setItem('customerName', data.customer.full_name);
        window.location.href = 'customer.html';
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
      const response = await fetch('http://localhost:3000/api/employee/login', {
        method: 'POST',
        headers: { 'Content-Type':  'application/json'},
        body: JSON.stringify({email, password})
      });
      const data = await response.json();
      console.log("Server response:", data.error || data.message || data);

      if(response.ok) {
        localStorage.setItem('employeeName', data.employee.full_name)
        window.location.href = 'admin.html';
      }else{
        alert(data.error);
      }

  } catch (err) {
      console.error('Server error:', err);
      alert('Could not connect to the server.');
    }
  });
}

const customerSignForm = document.querySelector('form[action="signup-form"]');
if (customerSignForm) {
  customerSignForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const full_name = customerSignForm.querySelector('input[name="full_name"]');
    const email = customerSignForm.querySelector('input[type="email"]').value.trim();
    const password = customerSignForm.querySelector('input[type="password"]').value.trim();

    try{
      const response = await fetch('http://localhost:3000/api/customer/signup', {
        method: 'POST',
        headers: { 'Content-Type':  'application/json'},
        body: JSON.stringify({full_name, email, password})
      });
      const data = await response.json();
      console.log("Sending to server:", { full_name, email, password });

      if (response.ok) {
        localStorage.setItem('customerName', full_name);
        window.location.href = 'customer.html';
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
              const response = await fetch('http://localhost:3000/api/customer/forgot-password', {
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
              const response = await fetch('http://localhost:3000/api/verify-otp', {
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
              const response = await fetch('http://localhost:3000/api/reset-password', {
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