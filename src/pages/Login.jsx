import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import "../styles/login.css";
import backgroundImage from "../images/background.png";
import logo from "../images/logo.jpg";

const pageBackgroundStyle = {
  backgroundImage: `url(${backgroundImage})`,
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "cover",
  backgroundAttachment: "fixed",
  backgroundColor: "#0b6d5d",
};

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");

    if (!username || !password) {
      setError("Please enter your username and password.");
      return;
    }

    try {
      setLoading(true);

      await signInWithEmailAndPassword(
        auth,
        username,
        password
      );

      navigate("/dashboard");

    } catch (error) {
      console.error(error);

      setError("Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
  className="login-container"
  style={pageBackgroundStyle}
>

      <div className="login-card">

        <div className="wrapper"> 

        <img className="login-logo" src={logo}></img>

        </div>

        <p className="login-subtitle">
          Login to your account
        </p>

        <form onSubmit={handleLogin}>

          <div className="input-group">
            <label>Username</label>

            <input
              type="email"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label>Password</label>

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="login-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

        </form>

      </div>

    </div>
  );
}