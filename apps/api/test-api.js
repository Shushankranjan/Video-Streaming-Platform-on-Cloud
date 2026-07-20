fetch("http://localhost:3001/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "test-run@example.com", password: "password123" })
})
.then(res => res.text().then(text => ({ status: res.status, body: text })))
.then(console.log)
.catch(console.error);
