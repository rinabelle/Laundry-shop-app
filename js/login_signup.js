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