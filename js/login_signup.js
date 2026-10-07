document.querySelectorAll('.switch-view').forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    const targetId = this.getAttribute('data-target');
    
    document.querySelectorAll('.form-section').forEach(section => {
      section.style.display = 'none';
    });
    
    document.getElementById(targetId).style.display = 'block';
  });
});