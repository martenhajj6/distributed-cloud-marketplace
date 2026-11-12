
const button = document.getElementById('checkServer');
const result = document.getElementById('result');

button.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/health');

        if (!response.ok) {
            throw new Error('Server returned an error');
        }

        const data = await response.json();

        result.textContent = data.message;
    } catch (error) {
        result.textContent = 'Unable to connect to backend';
        console.error(error);
    }
});
