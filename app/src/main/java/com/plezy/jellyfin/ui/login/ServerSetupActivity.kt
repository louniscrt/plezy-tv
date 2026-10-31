package com.plezy.jellyfin.ui.login

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.plezy.jellyfin.R
import com.plezy.jellyfin.data.api.JellyfinClient
import com.plezy.jellyfin.ui.main.MainActivity
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Écran de connexion Jellyfin avec support natif de **Quick Connect** :
 * - Génère immédiatement un code Quick Connect à 6 chiffres dès l'ouverture de l'écran.
 * - Interroge automatiquement le serveur toutes les 2,5 secondes (`GET /QuickConnect/Connect?secret=...`)
 *   jusqu'à ce que l'utilisateur clique sur "Authorize" dans son navigateur (/web/#/quickconnect).
 * - Ouvre automatiquement l'écran d'accueil Plezy TV dès que le code est autorisé.
 */
class ServerSetupActivity : AppCompatActivity() {

    private lateinit var jellyfinClient: JellyfinClient
    private var quickConnectJob: Job? = null

    private lateinit var etServerUrl: EditText
    private lateinit var tvQuickConnectCode: TextView
    private lateinit var tvQuickConnectStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // A launcher re-entry must reveal the existing task, including its player.
        if (!isTaskRoot && intent.action == Intent.ACTION_MAIN &&
            (intent.hasCategory(Intent.CATEGORY_LAUNCHER) || intent.hasCategory(Intent.CATEGORY_LEANBACK_LAUNCHER))) {
            finish()
            return
        }
        jellyfinClient = JellyfinClient(this)

        val forceSetup = intent.getBooleanExtra("force_setup", false)
        if (!forceSetup && jellyfinClient.isConfigured()) {
            openMainScreen()
            return
        }

        setContentView(R.layout.activity_server_setup)

        etServerUrl = findViewById(R.id.etServerUrl)
        val etUsername = findViewById<EditText>(R.id.etUsername)
        val etPassword = findViewById<EditText>(R.id.etPassword)
        val tvStatus = findViewById<TextView>(R.id.tvStatus)
        val btnConnect = findViewById<Button>(R.id.btnConnect)
        val btnQuickConnect = findViewById<Button>(R.id.btnQuickConnect)
        val btnDemoMode = findViewById<Button>(R.id.btnDemoMode)

        tvQuickConnectCode = findViewById(R.id.tvQuickConnectCode)
        tvQuickConnectStatus = findViewById(R.id.tvQuickConnectStatus)

        val savedUrl = jellyfinClient.serverUrl
        if (savedUrl.isNotBlank()) {
            etServerUrl.setText(savedUrl)
        }

        btnQuickConnect.setOnClickListener {
            startQuickConnectFlow()
        }

        btnConnect.setOnClickListener {
            val url = etServerUrl.text.toString().trim()
            val user = etUsername.text.toString().trim()
            val pass = etPassword.text.toString()

            if (url.isBlank() || user.isBlank()) {
                tvStatus.visibility = View.VISIBLE
                tvStatus.text = "Veuillez renseigner l'URL du serveur et votre identifiant."
                return@setOnClickListener
            }

            tvStatus.visibility = View.VISIBLE
            tvStatus.text = "Connexion en cours..."
            btnConnect.isEnabled = false

            lifecycleScope.launch {
                val res = jellyfinClient.authenticate(url, user, pass)
                btnConnect.isEnabled = true
                res.onSuccess {
                    openMainScreen()
                }.onFailure { err ->
                    tvStatus.text = "Échec : ${err.message}"
                }
            }
        }

        btnDemoMode.setOnClickListener {
            jellyfinClient.isDemoMode = true
            openMainScreen()
        }

        btnQuickConnect.requestFocus()

        // Démarre automatiquement Quick Connect dès l'arrivée sur l'écran !
        startQuickConnectFlow()
    }

    private fun startQuickConnectFlow() {
        quickConnectJob?.cancel()
        val targetUrl = etServerUrl.text.toString().trim().ifBlank { jellyfinClient.serverUrl }
        if (targetUrl.isBlank()) {
            tvQuickConnectCode.text = "••• •••"
            tvQuickConnectStatus.text = "Renseignez l'URL du serveur Jellyfin ci-dessous"
            return
        }
        tvQuickConnectCode.text = "••• •••"
        tvQuickConnectStatus.text = "Demande du code Quick Connect à Jellyfin..."

        quickConnectJob = lifecycleScope.launch {
            val initResult = jellyfinClient.initiateQuickConnect(targetUrl)
            initResult.onFailure { err ->
                tvQuickConnectCode.text = "ERREUR"
                tvQuickConnectStatus.text = "Quick Connect : ${err.message}. Vérifiez l'URL ($targetUrl)."
                return@launch
            }

            val qcState = initResult.getOrNull() ?: return@launch
            // Affichage lisible du code à 6 chiffres (ex: 815 964 ou 815964)
            tvQuickConnectCode.text = qcState.code
            tvQuickConnectStatus.text = "En attente d'autorisation pour 'lounis' sur Umbrel..."

            // Polling automatique toutes les 2,5 secondes jusqu'à validation dans le navigateur
            while (isActive) {
                delay(2500L)
                val checkRes = jellyfinClient.checkAndAuthenticateQuickConnect(qcState)
                checkRes.onSuccess { authenticated ->
                    if (authenticated) {
                        tvQuickConnectStatus.text = "Autorisé ! Ouverture de Plezy TV..."
                        openMainScreen()
                        return@launch
                    }
                }.onFailure { err ->
                    tvQuickConnectStatus.text = "Erreur validation : ${err.message}"
                }
            }
        }
    }

    private fun openMainScreen() {
        quickConnectJob?.cancel()
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    override fun onDestroy() {
        quickConnectJob?.cancel()
        super.onDestroy()
    }
}
