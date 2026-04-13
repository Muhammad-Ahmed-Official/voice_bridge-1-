export const SEND_EMAIL_CODE = (code) => `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Voice Bridge Password Reset</title>

<style>
body{
    font-family: Arial, sans-serif;
    background:#f6f6f6;
    margin:0;
    padding:0;
}

.container{
    max-width:600px;
    margin:auto;
    background:#ffffff;
    border-radius:8px;
    padding:30px;
    border:1px solid #E1E1E1;
}

.header{
    text-align:center;
    margin-bottom:25px;
}

.header h2{
    color:#00C26F;
    margin:0;
}

.header p{
    color:#7C7C7C;
    margin-top:6px;
}

.body p{
    color:#494949;
    line-height:1.6;
}

.code-box{
    margin:25px 0;
    text-align:center;
}

.code{
    display:inline-block;
    font-size:28px;
    letter-spacing:6px;
    font-weight:bold;
    padding:14px 28px;
    border-radius:6px;
    background:#e3e3e3;
    color:#1D1D1D;
}

.note{
    font-size:14px;
    color:#7C7C7C;
    margin-top:20px;
}

.footer{
    text-align:center;
    margin-top:30px;
    font-size:12px;
    color:#7C7C7C;
}

hr{
    border:none;
    border-top:1px solid #E1E1E1;
    margin:25px 0;
}
</style>
</head>

<body>

<div class="container">

<div class="header">
<h2>Voice Bridge</h2>
<p>Password Reset OTP</p>
</div>

<div class="body">

<p>Hello,</p>

<p>We received a request to reset your <strong>Voice Bridge</strong> password. Use the OTP below to continue.</p>
<p class="note">This OTP is for password reset only. If you did not request this, please ignore this email.</p>
<div class="code-box">
<span class="code">${code}</span>
</div>


</div>
<hr>

<div class="footer">
<p>© ${new Date().getFullYear()} Voice Bridge</p>
<p>Secure voice translation experience</p>
</div>
</div>
</body>
</html>
`;