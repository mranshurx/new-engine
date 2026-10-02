/*
========================================================
              ARMAN BHAI — OWNER PROTECTED
========================================================
  Project : MC PANEL V11
  Owner   : ARMAN BHAI
  Contact : +917462010034
  Telegram: @MC_PANEL_OWNER

  WARNING:
  This is a DEMO / CREDIT PROTECTION MODULE.
  Unauthorized copying is not permitted.
========================================================
*/

#include <iostream>
#include <string>

namespace ARMAN_BHAI_OWNER {

    const std::string OWNER_NAME   = "ARMAN BHAI";
    const std::string OWNER_NUMBER = "+917462010034";
    const std::string OWNER_USER   = "@MC_PANEL_OWNER";

    bool OwnerCheck() {
        std::cout << "\n====================================\n";
        std::cout << "       ARMAN BHAI OWNER CHECK\n";
        std::cout << "====================================\n";
        std::cout << "Owner   : " << OWNER_NAME << "\n";
        std::cout << "Number  : " << OWNER_NUMBER << "\n";
        std::cout << "Telegram: " << OWNER_USER << "\n";
        std::cout << "====================================\n";

        return true; // DEMO ONLY
    }

    void Credit() {
        std::cout << "\n[+] CREDIT: ARMAN BHAI\n";
        std::cout << "[+] Contact: " << OWNER_NUMBER << "\n";
        std::cout << "[+] User: " << OWNER_USER << "\n";
    }
}

int main() {

    if (!ARMAN_BHAI_OWNER::OwnerCheck()) {
        std::cout << "OWNER VERIFICATION FAILED!\n";
        return 1;
    }

    ARMAN_BHAI_OWNER::Credit();

    std::cout << "\n[ARMAN BHAI] MODULE LOADED SUCCESSFULLY\n";
    std::cout << "[ARMAN BHAI] DO NOT REMOVE OWNER CREDIT\n";

    return 0;
}