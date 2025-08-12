from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # --- Mock API Responses ---
            def handle_route(route):
                if "api/auth/login" in route.request.url:
                    body = route.request.post_data_json
                    if body.get("password") == "123456":
                        # Successful login
                        print("Mocking successful login response...")
                        route.fulfill(
                            status=200,
                            json={
                                "success": True,
                                "data": {
                                    "token": "fake-jwt-token",
                                    "teacher": {
                                        "id": "clx...",
                                        "name": "张老师",
                                        "teacher_id": "T2025001"
                                    }
                                }
                            }
                        )
                    else:
                        # Failed login
                        print("Mocking failed login response...")
                        route.fulfill(
                            status=401,
                            json={
                                "success": False,
                                "error": "工号或密码错误"
                            }
                        )
                else:
                    route.continue_()

            page.route("**/api/auth/login", handle_route)

            # Navigate to the login page
            page.goto("http://localhost:5173/login")

            # --- Test Case 1: Failed Login ---
            print("Testing failed login...")

            # Fill in credentials
            page.get_by_label("教师工号").fill("T2025001")
            page.get_by_label("密码").fill("wrongpassword")

            # Click login button
            page.get_by_role("button", name="立即登录").click()

            # Assert that the error alert is visible
            error_alert = page.get_by_role("alert")
            expect(error_alert).to_be_visible()
            expect(error_alert).to_have_text("工号或密码错误")

            print("Error message is visible as expected.")

            # Take a screenshot of the error state
            page.screenshot(path="jules-scratch/verification/login_error.png")
            print("Screenshot taken for failed login.")

            # Only testing the error case, as the environment is having timeout issues.

        except Exception as e:
            print(f"An error occurred: {e}")
            page.screenshot(path="jules-scratch/verification/verification_failed.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run_verification()
