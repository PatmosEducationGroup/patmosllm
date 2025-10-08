// Test file with intentional errors for pre-commit hook testing

export function testFunction() {
  const unused = "This variable is unused";
  console.log("Testing hook")
  return true
}

// Missing semicolons, unused variable
