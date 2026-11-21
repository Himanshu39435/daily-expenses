function authVersionMatches(tokenVersion, userVersion) {
  return (tokenVersion ?? 0) === (userVersion ?? 0);
}

module.exports = { authVersionMatches };
